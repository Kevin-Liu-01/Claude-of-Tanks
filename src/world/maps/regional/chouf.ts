// src/world/maps/regional/chouf.ts — the Chouf kit (Orchard Valley: the terraced valley below the Ain Zhalta–Barouk
// cedar forest on Mount Lebanon, with Beiteddine and Deir el Qamar). The mountain village of the 19th century: houses of
// dressed cream sandstone, the central-hall house (dar) of two storeys under a hipped roof of red Marseille tiles with
// its triple-arched window (qanatir) over the door between slender columns, round-headed windows with green or
// blue-grey shutters, iron balconies; the older single-storey houses under flat earth roofs behind a low parapet with
// the stone roller (mahdala) that packs them; the hammam under small domes pierced with glass oculi (qamariyyat); the
// souk's vaulted shops behind their arches; the sabil fountain under its dome; a stone church with its open bell arch;
// the terraces' vaulted stone stores and stables; a shelled house.
import {
  PartSink, faceBox, facePoint, normalize3, pick, rgb, shade, UV_MEMBER,
  type Face, type RegionalBucket, type RegionalParts, type Rgb, type Vec3,
} from './geometry.ts';
import { buildHouse, recordShaft, roofCrown, wallPolygon, windowRhythm, type FaceName, type HouseDialect, type HouseFrame, type Opening, type RoofSpec } from './house.ts';
import { archGlazing, archHead, openBelfry } from './sarajevoParts.ts';
import { doorUnit, paneBucket, windowUnit, type WindowStyle } from './openings.ts';
import { bloomDisc, pottedPlant, washingLine } from './dressing.ts';
import { recordShed } from './shedFall.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder } from './types.ts';

/** Shutters and doors: the Lebanese green, a blue-grey, a turquoise, a brown. */
const SHUTTERS: readonly Rgb[] = [0x3f6a4a, 0x4f7a5a, 0x5a7488, 0x4a8a8a, 0x6a5040].map(rgb);
const FRAME = rgb(0xd8d4c8), IRON = rgb(0x262626), MARBLE = rgb(0xe4e0d6), TIMBER = rgb(0x6a5440), CHAR = rgb(0x2a2622);

function uvOffset(ctx: RegionalBuildContext): [number, number] {
  return [ctx.rng() * 7.31, ctx.rng() * 5.17];
}

/**
 * The base geometry's measured footprint (ctx.bounds; the plot where it is empty). The coordinator's rule (2026-10-05,
 * Titan's pacing bisect: a kit barn 2.4 m short of its base warehouse opened a lane the bots drove through): a kit
 * building's main body fills it.
 */
interface Footprint { w: number; d: number; cx: number; cz: number }
function footprint(ctx: RegionalBuildContext): Footprint {
  const b = ctx.bounds;
  const ok = Number.isFinite(b.minX) && Number.isFinite(b.maxX) && b.maxX - b.minX > 0.5 && b.maxZ - b.minZ > 0.5;
  const x0 = ok ? b.minX : -ctx.info.w / 2, x1 = ok ? b.maxX : ctx.info.w / 2;
  const z0 = ok ? b.minZ : -ctx.info.d / 2, z1 = ok ? b.maxZ : ctx.info.d / 2;
  return { w: x1 - x0, d: z1 - z0, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 };
}
/**
 * Emit a body centred on the footprint, its local z (a roof's ridge) along the footprint's long side. On a footprint
 * longer in x the body is turned a quarter and `front` names its local x side (-1 or +1) that then faces the lot's +z
 * (the street). `body` gets the frame's across (W) and along (D) sizes and whether it turned.
 */
function onLot(sink: PartSink, fp: Footprint, body: (W: number, D: number, turned: boolean) => void, front: -1 | 1 = -1): void {
  if (fp.w > fp.d + 0.5) sink.placed(front < 0 ? Math.PI / 2 : -Math.PI / 2, fp.cx, 0, fp.cz, () => body(fp.d, fp.w, true));
  else sink.placed(0, fp.cx, 0, fp.cz, () => body(fp.w, fp.d, false));
}

interface ChoufState {
  rng: () => number;
  look: () => number;
  shutter: Rgb;
  window: WindowStyle;
  litShare: number;
}

function stateFor(ctx: RegionalBuildContext): ChoufState {
  const rng = ctx.rng;
  const shutter = pick(rng, SHUTTERS);
  return {
    rng, look: ctx.variant, shutter,
    window: {
      frame: FRAME, frameWidth: 0.06, frameOut: 0.05, bars: 'two',
      surround: { bucket: 'stone', width: 0.14, out: 0.04, lintel: 0.16 }, sill: { bucket: 'stone', out: 0.08 },
      shutters: { colour: shade(shutter, 0.86 + rng() * 0.26), kind: 'louvred', closed: 0.3 },
    },
    litShare: 0.45,
  };
}

/**
 * A round head over an opening on a face: the glazed or dark fanlight (a half disc fanned from its centre) and the
 * dressed stone archivolt round it, a few centimetres proud (dressing).
 */
function roundHead(sink: PartSink, face: Face, u: number, spring: number, w: number, fan: 'glass' | 'curtain' | 'dark', ring = 0.13): void {
  const r = w / 2, n = 8;
  const pts: Vec3[] = [facePoint(face, u, spring, 0.012)];
  for (let k = 0; k <= n; k++) { const a = Math.PI * k / n; pts.push(facePoint(face, u + Math.cos(a) * r, spring + Math.sin(a) * r, 0.012)); }
  sink.polygon(fan, pts, { decor: true, ...(fan === 'curtain' ? { window: face.out } : {}) });
  for (let k = 0; k < n; k++) {
    const a0 = Math.PI * k / n, a1 = Math.PI * (k + 1) / n, R = r + ring;
    sink.quad('stone', facePoint(face, u + Math.cos(a0) * r, spring + Math.sin(a0) * r, 0.03), facePoint(face, u + Math.cos(a0) * R, spring + Math.sin(a0) * R, 0.03),
      facePoint(face, u + Math.cos(a1) * R, spring + Math.sin(a1) * R, 0.03), facePoint(face, u + Math.cos(a1) * r, spring + Math.sin(a1) * r, 0.03), { decor: true });
  }
}

/**
 * The two haunches of an open round arch on a face between piers whose inner edges stand at u ± a: the stone between
 * the arch's curve (springing at ys, radius r about u) and the lintel's underside at `top`, each a solid fanned from its
 * outer top corner, `depth` deep into the face.
 */
function archHaunches(sink: PartSink, face: Face, u: number, ys: number, r: number, a: number, top: number, depth: number): void {
  const n = 6;
  const left: Array<[number, number]> = [[u - a, top], [u - a, ys]];
  for (let k = 0; k <= n; k++) { const t = Math.PI - (Math.PI / 2) * k / n; left.push([u + Math.cos(t) * r, ys + Math.sin(t) * r]); }
  left.push([u, top]);
  const right: Array<[number, number]> = [[u + a, top], [u, top]];
  for (let k = 0; k <= n; k++) { const t = Math.PI / 2 - (Math.PI / 2) * k / n; right.push([u + Math.cos(t) * r, ys + Math.sin(t) * r]); }
  right.push([u + a, ys]);
  // dressing: the piers and the lintel carry the collision (a haunch in every band ran the shell to its part cap). Each
  // haunch is concave: it is laid as convex wedges fanned from its outer corner (a prism's caps fan from its own ends)
  for (const poly of [left, right]) {
    const c = poly[0];
    for (let i = 1; i + 1 < poly.length; i++) {
      const a2 = poly[i], b2 = poly[i + 1];
      if (Math.abs((a2[0] - c[0]) * (b2[1] - c[1]) - (b2[0] - c[0]) * (a2[1] - c[1])) < 1e-4) continue;
      wallPolygon(sink, 'stone', face, [c, a2, b2], depth, { decor: true });
    }
  }
}

function dialect(st: ChoufState): HouseDialect {
  return {
    window: (sink, face, o, y0) => {
      if (o.kind === 'loft') { windowUnit(sink, face, o.u, y0 + o.y0, o.w, o.h, { ...st.window, shutters: null, bars: 'none' }, st.rng, 0); return; }
      windowUnit(sink, face, o.u, y0 + o.y0, o.w, o.h, st.window, st.rng, st.litShare);
      // the round head over the rectangular light: the arched window of the mountain house
      roundHead(sink, face, o.u, y0 + o.y0 + o.h + 0.02, o.w, paneBucket(st.rng, 0.3));
    },
    door: (sink, face, o, y0, frame) => {
      const big = o.w >= 1.3;
      doorUnit(sink, face, o.u, y0 + o.y0, o.w, o.h, {
        leaf: shade(st.shutter, 0.8), frame: { bucket: 'stone', width: 0.2, out: 0.06 }, transom: false, steps: { bucket: 'stone' }, leafKind: 'panel',
      }, frame.floors[o.storey] + o.y0);
      if (big || o.kind === 'gate') roundHead(sink, face, o.u, y0 + o.y0 + o.h + 0.02, o.w + 0.1, 'glass', 0.18);
    },
  };
}

/** The red Marseille-tile hip of the 19th-century house. */
const tileHip = (pitch: number): RoofSpec => ({ kind: 'hip', pitchDeg: pitch, eave: 0.5, verge: 0.5, thickness: 0.12, bucket: 'roof', ridge: 'saddle' });
/** The rolled clay-lime of an earth roof: the domes' limewash canvas painted down to the packed earth's grey-brown. */
const CLAY_LIME: Rgb = [0.7, 0.62, 0.52];
/**
 * The older flat earth roof behind a low parapet. (round 5, gauntlet wave 251 and the facades lane's read of it: the
 * roof took the walls' bucket and printed their ashlar): the rolled earth is the limewash bucket the domes already draw
 * (no new material) painted clay, inside a parapet of the walls' stone; its spouts (mizrab) through the parapet.
 */
const earthRoof = (parapet = 0.45): RoofSpec => ({
  kind: 'flat', pitchDeg: 0, eave: 0.12, verge: 0.12, thickness: 0.3, bucket: 'plaster', parapet, parapetBucket: 'stone', tint: CLAY_LIME,
});
/** The share of the village's one-storey houses still under the flat earth roof; the rest have taken the red tile. */
const EARTH_SHARE = 0.3;

/**
 * The spouts (mizrab) that throw the rain off an earth roof: a stone channel through the parapet at the roof's level,
 * standing half a metre proud of the wall, on the given sides (dressing). `along` spaces them on each side.
 */
function spouts(sink: PartSink, frame: HouseFrame, sides: ReadonlyArray<'left' | 'right' | 'back'>, look: () => number): void {
  const roof = frame.spec.roof, rg = frame.roof;
  const e = roof.eave, y = frame.eaveY + roof.thickness, th = 0.22, out = 0.5, half = 0.09;
  for (const side of sides) {
    const len = side === 'back' ? rg.s + e : rg.halfD + e;
    const n = len > 3.2 ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const a = (n === 1 ? 0 : (k === 0 ? -0.45 : 0.45)) * len + (look() - 0.5) * 0.6;
      if (side === 'back') {
        const z0 = -rg.halfD - e - out, z1 = -rg.halfD - e + th;
        sink.span('stone', a - half, y - 0.1, z0, a + half, y + 0.05, z1, { decor: true });
      } else {
        const sx = side === 'left' ? -1 : 1, x0 = sx * (rg.s + e - th), x1 = sx * (rg.s + e + out);
        sink.span('stone', Math.min(x0, x1), y - 0.1, a - half, Math.max(x0, x1), y + 0.05, a + half, { decor: true });
      }
    }
  }
}

/** The stone roller (mahdala) lying on a flat earth roof (dressing). */
function roller(sink: PartSink, frame: HouseFrame, look: () => number): void {
  const y = frame.eaveY + 0.3, x = (look() - 0.5) * frame.roof.s, z = (look() - 0.5) * frame.roof.halfD;
  sink.cylinder('stone', [x - 0.35, y + 0.2, z], 'x', 0.7, 0.2, 8, { decor: true, shade: 0.9 });
}

/**
 * The triple-arched window (qanatir) over the house's door on the upper floor: three tall round-headed lights close
 * together, two slender marble columns between them, a balcony slab and its iron rail under them (dressing; the
 * three openings are the house's own, cut into the wall).
 */
function qanatir(sink: PartSink, face: Face, u: number, floorY: number, rng: () => number): void {
  const w = 0.82, h = 2.0, step = 0.98, sill = 0.35;
  for (const k of [-1, 0, 1]) roundHead(sink, face, u + k * step, floorY + sill + h + 0.02, w, paneBucket(rng, 0.5), 0.1);
  for (const k of [-0.5, 0.5]) {
    sink.cylinder('stone', facePoint(face, u + k * step, floorY + sill, 0.1), 'y', h + 0.05, 0.075, 8, { colour: MARBLE, decor: true });
    faceBox(sink, 'stone', face, u + k * step, floorY + sill + h + 0.08, 0.1, 0.24, 0.14, 0.2, { decor: true });
  }
  // the balcony: a slab on corbels, the iron rail
  faceBox(sink, 'stone', face, u, floorY - 0.06, 0.45, step * 3 + 0.5, 0.16, 0.9, { decor: true });
  for (const k of [-1.5, 0, 1.5]) faceBox(sink, 'stone', face, u + k * step * 0.95, floorY - 0.3, 0.3, 0.2, 0.36, 0.6, { decor: true });
  faceBox(sink, 'structureMetal', face, u, floorY + 0.95, 0.86, step * 3 + 0.45, 0.04, 0.04, { colour: IRON, decor: true });
  for (let k = 0; k <= 12; k++) faceBox(sink, 'structureMetal', face, u - (step * 3 + 0.4) / 2 + (step * 3 + 0.4) * k / 12, floorY + 0.5, 0.86, 0.025, 0.9, 0.025, { colour: IRON, decor: true, fine: true });
}

interface DarOpts { storeys: 1 | 2; roof: 'tile' | 'earth'; qanatir?: boolean; stair?: boolean }

/**
 * The village house: one or two storeys of dressed sandstone, round-headed windows, the arched door; the dar's upper
 * floor carries the triple arch over its door; a red tile hip or a flat earth roof with its parapet and roller; an
 * outside stair up the side to the upper floor or the roof.
 */
function dar(ctx: RegionalBuildContext, opts: DarOpts): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx), rng = st.rng, look = st.look;
  const fp = footprint(ctx);
  const stair = !!opts.stair;
  const storeyH = [3.3 + rng() * 0.3, 3.4];
  const storeys = Array.from({ length: opts.storeys }, (_, i) => ({ h: storeyH[i], wall: 'stone' as RegionalBucket }));
  const roof = opts.roof === 'tile' ? tileHip(24 + rng() * 5) : earthRoof();
  // the window dialect cuts the triple arch's three lights as plain openings; the qanatir dressing heads them
  const plain = dialect(st);
  onLot(sink, fp, (Wf, Df, turned) => {
    // the outside stair takes a metre on the body's +x side, the house the rest of the footprint; the street front is
    // the face toward the lot's +z — the end (front) on a deep lot, the long side (left) on a wide one
    const sw = stair ? 1.05 : 0;
    const W = Math.max(4.2, Wf - sw - 0.1), D = Math.max(5.5, Df - 0.1), shift = -sw / 2;
    const street: FaceName = turned ? 'left' : 'front', rear: FaceName = turned ? 'right' : 'back';
    const sides: FaceName[] = turned ? ['front', 'back'] : ['left', 'right'];
    const streetLen = turned ? D : W, sideLen = turned ? W : D;
    const openings: Opening[] = [];
    const doorU = 0;
    openings.push({ face: street, storey: 0, kind: 'door', u: doorU, w: opts.storeys > 1 ? 1.35 : 1.1, y0: 0, h: 2.3 });
    for (const o of windowRhythm(street, 0, streetLen, { w: 0.85, h: 1.45, sill: 1.0, spacing: 2.3, margin: 0.9, avoid: [[doorU - 0.9, doorU + 0.9]], max: 2 })) openings.push(o);
    if (opts.storeys > 1) {
      if (opts.qanatir) for (const k of [-1, 0, 1]) openings.push({ face: street, storey: 1, kind: 'window', u: doorU + k * 0.98, w: 0.82, y0: 0.35, h: 2.0 });
      for (const o of windowRhythm(street, 1, streetLen, { w: 0.85, h: 1.5, sill: 0.9, spacing: 2.4, margin: 0.9, avoid: opts.qanatir ? [[doorU - 1.6, doorU + 1.6]] : [], max: 2 })) openings.push(o);
    }
    for (let s = 0; s < opts.storeys; s++) {
      for (const face of sides) for (const o of windowRhythm(face, s, sideLen, { w: 0.8, h: 1.35, sill: 1.0, spacing: 2.8, margin: 1.2, max: 3 })) openings.push(o);
      for (const o of windowRhythm(rear, s, streetLen, { w: 0.8, h: 1.35, sill: 1.0, spacing: 2.8, margin: 1.2, max: 2 })) openings.push(o);
    }
    const triple = new Set(opts.qanatir ? [-0.98, 0, 0.98].map((k) => (doorU + k).toFixed(2)) : []);
    sink.placed(0, shift, 0, 0, () => {
      const frame = buildHouse(sink, {
        // (round 2, wave 123: "no plinths"): the mountain house's high base course, standing proud of the walls
        w: W, d: D, plinth: { h: 0.85, out: 0.12, bucket: 'stone' }, storeys, roof, gableBucket: 'stone', openings,
        chimneys: opts.roof === 'tile' ? [{ x: -W * 0.2, z: -D * 0.2, sx: 0.55, sz: 0.55, above: 0.7, bucket: 'stone', cap: 'slab' }] : [],
        gutters: null, verge: null, reveal: 0.3, spall: null,
      }, {
        ...plain,
        window: (s, face, o, y0, frame) => {
          if (o.storey === 1 && o.face === street && triple.has(o.u.toFixed(2))) {
            windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { ...st.window, shutters: null, bars: 'two', surround: null }, rng, 0.55);
            return;
          }
          plain.window(s, face, o, y0, frame);
        },
      });
      // a string course between the storeys and the cornice under the eaves
      if (opts.storeys > 1) sink.band('stone', -W / 2 - 0.05, frame.floors[1] - 0.12, -D / 2 - 0.05, W / 2 + 0.05, frame.floors[1] + 0.06, D / 2 + 0.05, { decor: true });
      if (opts.qanatir && opts.storeys > 1) qanatir(sink, frame.faces[street], doorU, frame.floors[1], rng);
      if (opts.roof === 'earth') { roller(sink, frame, look); spouts(sink, frame, ['left', 'back'], look); }
      // the outside stair up the +x side to the upper floor (or the roof), its parapet (structural wedge, dressed treads)
      if (stair) {
        const f = frame.faces.right, top = opts.storeys > 1 ? frame.floors[1] : frame.eaveY;
        const run = Math.min(D - 1.6, top / 0.19 * 0.28), width = 0.95;
        const u0 = D / 2 - 0.4 - run;
        const wedge: Array<[number, number]> = [[u0, -0.3], [D / 2 - 0.4, -0.3], [D / 2 - 0.4, top - 0.12], [u0, 0.1]];
        const pts = wedge.map(([u, y]) => facePoint(f, u, y, width)).reverse();
        sink.prism('stone', pts, [-f.out[0], -f.out[1], -f.out[2]], width);
        const steps = Math.max(5, Math.round(top / 0.19));
        for (let k = 0; k < steps; k++) {
          const a = u0 + run * k / steps, b = u0 + run * (k + 1) / steps;
          faceBox(sink, 'stone', f, (a + b) / 2, top * (k + 1) / steps - 0.08, width / 2, b - a + 0.004, 0.16, width, { decor: true });
        }
        // the stair's foot carries on to the body's end as a low terrace wall (the stair and the house fill the lot)
        if (u0 > -D / 2 + 0.6) faceBox(sink, 'stone', f, (-D / 2 + u0) / 2, 0.3, width / 2, u0 + D / 2, 0.9, width);
      }
      const rf = frame.faces[rear], sf = frame.faces[street];
      if (look() < 0.5 && opts.storeys > 1) washingLine(sink, rf, -rf.width / 2 + 0.6, Math.min(rf.width / 2 - 0.6, -rf.width / 2 + 3.4), frame.floors[1] + 2.1, look);
      if (look() < 0.6) { const p = facePoint(sf, doorU + 1.0, 0.1, 0.5); pottedPlant(sink, p[0], p[1], p[2], 0.42, look); }
    });
  }, -1);
  return sink.finish();
}

/** A dome of `r` on a drum at height y over (x, z): stacked frustums, plastered (domes are rendered and limewashed). */
function dome(sink: PartSink, x: number, y: number, z: number, r: number, bucket: RegionalBucket, oculi: number, look: () => number): void {
  const n = 6;
  for (let k = 0; k < n; k++) {
    const a0 = (Math.PI / 2) * k / n, a1 = (Math.PI / 2) * (k + 1) / n;
    const y0 = y + Math.sin(a0) * r, y1 = y + Math.sin(a1) * r;
    sink.cylinder(bucket, [x, y0, z], 'y', y1 - y0, Math.cos(a0) * r, 14, {}, Math.max(0.04, Math.cos(a1) * r), k === 0 || k === n - 1);
  }
  // the qamariyyat: small glass lights set in rings in the dome, each a little quad laid on the facet it pierces (the
  // connectivity sweep, 217: laid on the true sphere they stood up to 6 cm off the faceted dome)
  const seg = (Math.PI * 2) / 14, ring = Math.PI / 2 / n;
  for (const [theta, count] of [[0.55, oculi], [0.95, Math.max(3, Math.round(oculi * 0.6))]] as const) {
    const kk = Math.min(n - 1, Math.floor(theta / ring)), a0 = ring * kk, a1 = ring * (kk + 1);
    const rho0 = Math.cos(a0) * r * Math.cos(seg / 2), rho1 = Math.max(0.04, Math.cos(a1) * r) * Math.cos(seg / 2);
    const y0r = Math.sin(a0) * r, dy = (Math.sin(a1) - Math.sin(a0)) * r, drho = rho1 - rho0, len = Math.hypot(dy, drho);
    for (let k = 0; k < count; k++) {
      const phi = (k + look() * 0.3) * Math.PI * 2 / count, s = Math.min(0.14, r * 0.08);
      const tc = (Math.floor((((phi % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / seg) + 0.5) * seg;
      const nrm: Vec3 = [Math.cos(theta) * Math.cos(phi), Math.sin(theta), Math.cos(theta) * Math.sin(phi)];
      // the facet's plane (its normal out and up the dome) and where the light's ray from the centre meets it
      const N: Vec3 = [dy * Math.cos(tc) / len, -drho / len, dy * Math.sin(tc) / len];
      const lam = (dy * rho0 - drho * y0r) / (dy * Math.cos(theta) * Math.cos(phi - tc) - drho * Math.sin(theta));
      const c: Vec3 = [x + nrm[0] * lam + N[0] * 0.012, y + nrm[1] * lam + N[1] * 0.012, z + nrm[2] * lam + N[2] * 0.012];
      const t1: Vec3 = [-Math.sin(tc), 0, Math.cos(tc)], t2: Vec3 = [drho * Math.cos(tc) / len, dy / len, drho * Math.sin(tc) / len];
      const p = (a: number, b: number): Vec3 => [c[0] + t1[0] * a + t2[0] * b, c[1] + t1[1] * a + t2[1] * b, c[2] + t1[2] * a + t2[2] * b];
      sink.quad('curtain', p(-s, -s), p(-s, s), p(s, s), p(s, -s), { decor: true, window: N });
    }
  }
}

/**
 * The hammam: a low block of stone under flat roofs, the hot room's great dome pierced with glass oculi, the smaller
 * domes of the warm rooms, the arched entrance, the furnace's stack at the back.
 */
const hammam: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx), rng = st.rng, look = st.look;
  const fp = footprint(ctx);
  const W = Math.max(6, fp.w - 0.1), D = Math.max(6, fp.d - 0.1), H = 4.4 + rng() * 0.4;
  const openings: Opening[] = [
    { face: 'front', storey: 0, kind: 'door', u: -W * 0.18, w: 1.5, y0: 0, h: 2.5 },
    { face: 'front', storey: 0, kind: 'loft', u: W * 0.22, w: 0.6, y0: 2.2, h: 0.8 },
  ];
  sink.placed(0, fp.cx, 0, fp.cz, () => {
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.6, out: 0.1, bucket: 'stone' }, storeys: [{ h: H, wall: 'stone' }], roof: earthRoof(0.4), gableBucket: 'stone', openings,
      chimneys: [], gutters: null, verge: null, reveal: 0.35, spall: null,
    }, dialect(st));
    spouts(sink, frame, ['left', 'right'], look);
    const top = frame.eaveY + 0.3;
    // the hot room's dome over the back half on its octagonal drum, two smaller domes forward
    const R = Math.min(W, D) * 0.27, dz = -D * 0.18;
    // (round 2, wave 123: "perched domes"): each dome seated on a drum of its own height with a stone cornice ring
    sink.cylinder('plaster', [0, top - 0.1, dz], 'y', 1.4, R + 0.3, 8, {}, R + 0.22, true, Math.PI / 8);
    sink.cylinder('stone', [0, top + 1.18, dz], 'y', 0.14, R + 0.34, 8, { decor: true }, R + 0.34, true, Math.PI / 8);
    dome(sink, 0, top + 1.3, dz, R, 'plaster', 10, look);
    for (const sx of [-1, 1]) {
      const r = R * 0.55, x = sx * W * 0.26, z = D * 0.24;
      sink.cylinder('plaster', [x, top - 0.1, z], 'y', 0.85, r + 0.2, 8, {}, r + 0.14, true, Math.PI / 8);
      sink.cylinder('stone', [x, top + 0.64, z], 'y', 0.11, r + 0.24, 8, { decor: true }, r + 0.24, true, Math.PI / 8);
      dome(sink, x, top + 0.75, z, r, 'plaster', 6, look);
    }
    // the furnace stack at the back corner
    sink.span('stone', W / 2 - 1.3, 0, -D / 2 + 0.3, W / 2 - 0.4, top + 3.2, -D / 2 + 1.2);
  });
  return sink.finish();
};

/** The souk's row: vaulted shops behind round arches on stone piers, plank doors and shutters, a flat roof. */
const souk: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx), rng = st.rng, look = st.look;
  const fp = footprint(ctx);
  const H = 3.6;
  onLot(sink, fp, (Wf, Df) => {
    const W = Math.max(3.5, Wf - 0.1), L = Math.max(5, Df - 0.1);
    const nb = Math.max(2, Math.round(L / 3.0)), bay = L / nb;
    const openings: Opening[] = [];
    for (let k = 0; k < nb; k++) openings.push({ face: 'right', storey: 0, kind: 'door', u: -L / 2 + (k + 0.5) * bay, w: Math.min(1.9, bay - 0.8), y0: 0, h: 2.3 });
    const frame = buildHouse(sink, {
      w: W, d: L, plinth: { h: 0.45, out: 0.08, bucket: 'stone' }, storeys: [{ h: H, wall: 'stone' }], roof: earthRoof(0.35), gableBucket: 'stone', openings,
      chimneys: [], gutters: null, verge: null, reveal: 0.4, spall: null,
    }, {
      window: () => {},
      door: (s, face, o, y0) => {
        // the shop's plank doors folded open on the dark of the vault, the round arch over the opening
        const r = s.recess, go = r > 0 ? -r + 0.03 : 0.015;
        // (round 2, wave 123: "black voids"): the vault's back a deep brown of goods and shadow, not a black hole
        faceBox(s, 'structureWood', face, o.u, y0 + o.y0 + o.h / 2, go, o.w, o.h, 0.04, { colour: rgb(0x3a2c22) });
        for (const side of [-1, 1]) faceBox(s, 'structureWood', face, o.u + side * (o.w / 2 + 0.32), y0 + o.y0 + o.h / 2, 0.05, 0.6, o.h - 0.1, 0.05, { colour: shade(st.shutter, 0.85), decor: true });
        roundHead(s, face, o.u, y0 + o.y0 + o.h + 0.02, o.w, 'glass', 0.2);
      },
    });
    spouts(sink, frame, ['left', 'back'], look);
    // the awnings of cloth over a few of the shops
    for (let k = 0; k < nb; k++) {
      if (rng() < 0.45) continue;
      const u = -L / 2 + (k + 0.5) * bay, c = pick(rng, [rgb(0x9a3a2c), rgb(0x2f5a7a), rgb(0xc8b88a), rgb(0x4f6a3a)]);
      faceBox(sink, 'structureWood', frame.faces.right, u, 3.05, 0.55, Math.min(2.2, bay - 0.3), 0.05, 1.1, { colour: c, decor: true });
    }
  }, 1);
  return sink.finish();
};

/** The sabil: a public fountain under a dome on four arches, its basin and spouts; its piers and lintels fill the footprint. */
const sabil: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const look = ctx.variant;
  const fp = footprint(ctx);
  const Sx = Math.max(3.2, fp.w - 0.6), Sz = Math.max(3.2, fp.d - 0.6), H = 3.4, p = 0.55;
  sink.placed(0, fp.cx, 0, fp.cz, () => {
    // the platform reaches the footprint's edges (0.3 past the piers), the piers at the corners, the lintel ring
    sink.span('stone', -Sx / 2 - 0.3, -0.3, -Sz / 2 - 0.3, Sx / 2 + 0.3, 0.25, Sz / 2 + 0.3);
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) sink.span('stone', sx * Sx / 2 - (sx > 0 ? p : 0), 0.25, sz * Sz / 2 - (sz > 0 ? p : 0), sx * Sx / 2 + (sx < 0 ? p : 0), H, sz * Sz / 2 + (sz < 0 ? p : 0));
    // the lintel ring over the four arches (round 5, gauntlet wave 251: from under the kiosk the solid lintel slab read as
    // a flat ashlar ceiling lit as in sun): four beams round the open middle, and over the middle the drum's floor, a
    // limewashed soffit 0.25 m up in the kiosk's shade
    const lw = 0.75;
    sink.span('stone', -Sx / 2, H, -Sz / 2, Sx / 2, H + 0.55, -Sz / 2 + lw);
    sink.span('stone', -Sx / 2, H, Sz / 2 - lw, Sx / 2, H + 0.55, Sz / 2);
    sink.span('stone', -Sx / 2, H, -Sz / 2 + lw, -Sx / 2 + lw, H + 0.55, Sz / 2 - lw);
    sink.span('stone', Sx / 2 - lw, H, -Sz / 2 + lw, Sx / 2, H + 0.55, Sz / 2 - lw);
    sink.span('plaster', -Sx / 2 + lw, H + 0.25, -Sz / 2 + lw, Sx / 2 - lw, H + 0.55, Sz / 2 - lw, { shade: 0.55 });
    for (const f of [
      { origin: [0, 0, Sz / 2], u: [1, 0, 0], out: [0, 0, 1], width: Sx }, { origin: [Sx / 2, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: Sz },
      { origin: [0, 0, -Sz / 2], u: [-1, 0, 0], out: [0, 0, -1], width: Sx }, { origin: [-Sx / 2, 0, 0], u: [0, 0, 1], out: [-1, 0, 0], width: Sz },
    ] as Face[]) {
      // a long face's arch keeps a semicircle of the kiosk's height: its piers widen to meet it
      const a = Math.min(f.width / 2 - p, H - 1.2), ext = f.width / 2 - p - a;
      if (ext > 0.02) for (const side of [-1, 1]) {
        // (a free-standing span: a face box seated into the wall leaves its back face out)
        const P = (u: number, o: number): [number, number] => [f.origin[0] + f.u[0] * u + f.out[0] * o, f.origin[2] + f.u[2] * u + f.out[2] * o];
        const [ax, az] = P(side * a, -p), [bx, bz] = P(side * (a + ext), 0);
        sink.span('stone', Math.min(ax, bx), 0.25, Math.min(az, bz), Math.max(ax, bx), H, Math.max(az, bz));
      }
      archHaunches(sink, f, 0, H - a - 0.08, a, a, H, 0.5);
    }
    const S = Math.min(Sx, Sz);
    // (round 2, wave 123: "perched domes"): the dome on a short drum over the lintel ring
    sink.cylinder('plaster', [0, H + 0.55, 0], 'y', 0.55, S * 0.42 + 0.12, 8, {}, S * 0.42 + 0.08, true, Math.PI / 8);
    dome(sink, 0, H + 1.1, 0, S * 0.42, 'plaster', 0, look);
    // the basin under the dome and the spout's water
    sink.cylinder('stone', [0, 0.25, 0], 'y', 0.6, S * 0.28, 12, {}, S * 0.3);
    sink.cylinder('glass', [0, 0.84, 0], 'y', 0.02, S * 0.25, 12, { decor: true });
  });
  return sink.finish();
};

/**
 * The campanile (round 5, gauntlet wave 252: "the church silhouette and its campanile"): a square stone shaft on the
 * nave's front corner on its +x side (inside the lot), string courses, the belfry's round-headed opening on each face
 * under a cornice, a stone pyramid and its iron cross.
 */
function campanile(sink: PartSink, W: number, D: number, naveTop: number, look: () => number): void {
  const T = Math.min(3.6, W * 0.42), x0 = W / 2 - T, x1 = W / 2, z0 = D / 2 - T, z1 = D / 2;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const shaftTop = naveTop + 5.2 + look() * 1.4;
  // (props census #5, lane B 2026-10-15) the belfry open through the shaft (its openings were dark plates on a solid
  // span): the shaft to the openings' sill, the four corner piers and the head over them, the bell on its beam; the
  // shaft recorded as a tower body (it topples in its courses)
  const ow = T * 0.42, oy = shaftTop - 3.2, oh = 1.9;
  sink.span('stone', x0, 0, z0, x1, oy, z1);
  openBelfry(sink, 'stone', cx, cz, T, oy, oy + oh + ow / 2, shaftTop, ow, rgb(0x6a5a3a), rgb(0x4a3a2a));
  recordShaft(sink, cx, cz, T, shaftTop + 0.3 + T * 0.95, 'stone');
  for (const y of [naveTop - 0.4, shaftTop - 3.7]) sink.band('stone', x0 - 0.08, y, z0 - 0.08, x1 + 0.08, y + 0.22, z1 + 0.08, { decor: true });
  sink.span('stone', x0 - 0.15, shaftTop, z0 - 0.15, x1 + 0.15, shaftTop + 0.3, z1 + 0.15, { decor: true });
  const base = shaftTop + 0.3, apex: Vec3 = [cx, base + T * 0.95, cz];
  const corners: Array<[number, number]> = [[x0 - 0.1, z0 - 0.1], [x1 + 0.1, z0 - 0.1], [x1 + 0.1, z1 + 0.1], [x0 - 0.1, z1 + 0.1]];
  for (let k = 0; k < 4; k++) {
    const [ax, az] = corners[k], [bx, bz] = corners[(k + 1) % 4];
    sink.polygon('stone', [[ax, base, az], apex, [bx, base, bz]], { decor: true });
  }
  sink.span('structureMetal', cx - 0.04, apex[1] - 0.1, cz - 0.04, cx + 0.04, apex[1] + 1.2, cz + 0.04, { colour: IRON, decor: true });
  sink.span('structureMetal', cx - 0.3, apex[1] + 0.75, cz - 0.035, cx + 0.3, apex[1] + 0.83, cz + 0.035, { colour: IRON, decor: true });
}

/**
 * The village church: a stone nave under a red tile roof, its arched door and windows, the open bell arch on the west
 * gable — or, on the summit church, the campanile on the nave's front corner. The nave runs along the footprint's long
 * side; on a wide lot its door opens in the long side to the street.
 */
const makeChurch = (withCampanile: boolean): RegionalBuilder => (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx), rng = st.rng;
  const fp = footprint(ctx);
  onLot(sink, fp, (Wf, Df, turned) => {
    const W = Math.max(5, Wf - 0.1), D = Math.max(8, Df - 0.1);
    const doorFace: FaceName = turned ? 'left' : 'front';
    // (props census #5) the round heads cut through the wall with the rest of the opening (they were glass fans laid on
    // it over the cut light): the glazing in the head at the back of the reveal, the stone ring round it
    const lights = (face: FaceName, avoid: Array<[number, number]>) => windowRhythm(face, 0, D, { w: 0.8, h: 1.9, sill: 2.0, spacing: 2.8, margin: 1.3, avoid })
      .map((o): Opening => ({ ...o, arch: {} }));
    const openings: Opening[] = [
      { face: doorFace, storey: 0, kind: 'door', u: 0, w: 1.5, y0: 0, h: 2.6, arch: {} },
      ...lights('left', turned ? [[-1.2, 1.2]] : []),
      ...lights('right', []),
    ];
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.7, out: 0.1, bucket: 'stone' }, storeys: [{ h: 5.6, wall: 'stone' }],
      roof: { kind: 'gable', pitchDeg: 28, eave: 0.35, verge: 0.25, thickness: 0.12, bucket: 'roof', ridge: 'saddle' }, gableBucket: 'stone', openings,
      chimneys: [], gutters: null, verge: null, reveal: 0.4, spall: null,
    }, {
      ...dialect(st),
      window: (s, face, o, y0) => {
        windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { ...st.window, shutters: null, bars: 'six' }, rng, 0.3);
        archGlazing(s, face, o.u, y0 + o.y0 + o.h, o.w / 2, st.window.frame);
        archHead(s, face, o.u, y0 + o.y0 + o.h, o.w / 2, 'stone', 0.13, 6);
      },
      door: (s, face, o, y0, fr) => {
        doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, {
          leaf: shade(st.shutter, 0.8), frame: { bucket: 'stone', width: 0.2, out: 0.06 }, transom: false, steps: { bucket: 'stone' }, leafKind: 'panel',
        }, fr.floors[o.storey] + o.y0);
        archGlazing(s, face, o.u, y0 + o.y0 + o.h, o.w / 2, st.window.frame);
        archHead(s, face, o.u, y0 + o.y0 + o.h, o.w / 2 + 0.05, 'stone', 0.18, 7);
      },
    });
    if (withCampanile) { campanile(sink, W, D, frame.eaveY, st.look); return; }
    // the bell arch over the front gable: two piers and their arch, the bell, the cross
    const top = frame.roof.ridgeY, z = D / 2 - 0.3;
    // (props census #5: the bell arch a crown of the roof in the house's plan: it falls with its roof section)
    roofCrown(sink, frame, { kind: 'bellcote', x0: -1.2, x1: 1.2, z0: z - 0.34, z1: z + 0.34, y0: top - 1.0, y1: top + 3.5, bucket: 'stone' }, () => {
      sink.span('stone', -1.1, top - 1.0, z - 0.3, -0.55, top + 2.0, z + 0.3);
      sink.span('stone', 0.55, top - 1.0, z - 0.3, 1.1, top + 2.0, z + 0.3);
      sink.span('stone', -1.2, top + 2.0, z - 0.34, 1.2, top + 2.5, z + 0.34);
      archHaunches(sink, { origin: [0, 0, z + 0.3], u: [1, 0, 0], out: [0, 0, 1], width: 2.2 }, 0, top + 1.4, 0.55, 0.55, top + 2.0, 0.6);
      sink.cylinder('structureMetal', [0, top + 0.75, z], 'y', 0.6, 0.3, 10, { colour: rgb(0x6a5a3a), decor: true }, 0.15);
      // (the buildings stream, 2026-10-12, the integrity check: the bell hung between the piers on nothing) its yoke
      sink.span('structureMetal', -0.6, top + 1.35, z - 0.04, 0.6, top + 1.43, z + 0.04, { colour: IRON, decor: true });
      sink.span('structureMetal', -0.035, top + 2.5, z - 0.035, 0.035, top + 3.5, z + 0.035, { colour: IRON, decor: true });
      sink.span('structureMetal', -0.25, top + 3.05, z - 0.03, 0.25, top + 3.13, z + 0.03, { colour: IRON, decor: true });
    });
  }, -1);
  return sink.finish();
};

/**
 * The terrace store (qabu): a vaulted stone room half into the slope, a flat roof, a low arched door. (Props census #22,
 * Lane C 2026-10-16: "three blank walls, no plinth, no lintel".) The terrace's rubble bank now rises against its back
 * and sides to the roof's edge, held at the front corners by two dry-stone wing walls; the front carries the dressed
 * quoins, the arched door cut through it under its ring of voussoirs and keystone, and two vents cut high either side.
 */
const store: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx), look = st.look;
  const fp = footprint(ctx);
  const W = Math.max(2.0, fp.w - 0.1), D = Math.max(2.0, fp.d - 0.1);
  const small = Math.min(W, D) < 3.2, h = small ? 2.3 : 2.8;
  const spring = Math.min(1.45, h - 0.85), dw = 0.9;
  const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: 0, w: dw, y0: 0, h: spring, arch: { spring } }];
  if (W >= 2.6) for (const s2 of [-1, 1]) openings.push({ face: 'front', storey: 0, kind: 'loft', u: s2 * (W / 2 - 0.6), w: 0.16, h: 0.42, y0: h - 0.95 });
  const base = dialect({ ...st, litShare: 0 });
  sink.placed(0, fp.cx, 0, fp.cz, () => {
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: null, storeys: [{ h, wall: 'stone' }], roof: earthRoof(0.3), gableBucket: 'stone',
      openings, chimneys: [], gutters: null, verge: null, reveal: 0.35, spall: null, core: 'rubble',
    }, {
      ...base,
      // a vent is left empty (its reveal and the store's dark); the door's leaf fills the rectangle under the arch
      window: (s, face, o, y0, fr) => { if (o.kind !== 'loft') base.window(s, face, o, y0, fr); },
      door: (s, face, o, y0) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, {
        leaf: shade(st.shutter, 0.8), frame: { bucket: 'stone', width: 0.12, out: 0.04 }, transom: false, steps: { bucket: 'stone' }, leafKind: 'plank',
      }, 0),
    });
    const f = frame.faces.front;
    // the ring of voussoirs over the door's arch and its keystone; the dressed quoins up the front corners
    archHead(sink, f, 0, spring, dw / 2, 'stone', 0.2, 7);
    faceBox(sink, 'stone', f, 0, spring + dw / 2 + 0.12, 0.05, 0.24, 0.3, 0.1, { decor: true, fineSides: true });
    for (const s2 of [-1, 1]) for (let y = 0, k = 0; y < h - 0.2; y += 0.38, k++) {
      const long = k % 2 === 0;
      faceBox(sink, 'stone', f, s2 * (W / 2 - (long ? 0.26 : 0.16)), y + 0.18, 0.025, long ? 0.52 : 0.32, 0.34, 0.05, { decor: true, fineSides: true, shade: 1.06 });
    }
    // the terrace: its rubble bank up the back and sides to the wall heads, the wing walls holding it at the front
    const top = frame.eaveY, g = -0.25, o = 1.8, zf = D / 2 - 0.35;
    const bank = (pts: Vec3[], want: Vec3) => {
      const [p0, p1, p2] = pts;
      const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2], vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
      const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
      sink.polygon('stone', n[0] * want[0] + n[1] * want[1] + n[2] * want[2] >= 0 ? pts : [...pts].reverse(), { decor: true, tint: [0.92, 0.88, 0.8] });
    };
    const T = (x: number, z: number): Vec3 => [x, top, z], B = (x: number, z: number): Vec3 => [x, g, z];
    bank([T(-W / 2, -D / 2), T(W / 2, -D / 2), B(W / 2 + o, -D / 2 - o), B(-W / 2 - o, -D / 2 - o)], [0, 1, -1]);
    for (const s2 of [-1, 1]) {
      bank([T(s2 * W / 2, -D / 2), T(s2 * W / 2, zf), B(s2 * (W / 2 + o), zf), B(s2 * (W / 2 + o), -D / 2 - o)], [s2, 1, 0]);
      sink.span('stone', s2 > 0 ? W / 2 : -W / 2 - 0.65, -0.3, zf - 0.02, s2 > 0 ? W / 2 + 0.65 : -W / 2, top, zf + 0.38);
      // the bank's face over the wing wall's back, down to the ground at its end
      bank([T(s2 * W / 2, zf), B(s2 * (W / 2 + 0.65), zf), B(s2 * (W / 2 + o), zf)], [0, 0, 1]);
    }
    if (!small) roller(sink, frame, look);
    spouts(sink, frame, ['back'], look);
  });
  return sink.finish();
};

/** The stable: a long stone barn under a flat roof (or a tile one), its arched doors and slit windows. */
const stable: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx), rng = st.rng, look = st.look;
  const fp = footprint(ctx);
  const tile = rng() < 0.4;
  onLot(sink, fp, (Wf, Df) => {
    const W = Math.max(4, Wf - 0.1), L = Math.max(6, Df - 0.1);
    const openings: Opening[] = [
      { face: 'front', storey: 0, kind: 'door', u: 0, w: 1.6, y0: 0, h: 2.4 },
      ...windowRhythm('left', 0, L, { w: 0.25, h: 0.9, sill: 1.6, spacing: 2.2, margin: 1.0 }).map((o): Opening => ({ ...o, kind: 'loft' })),
      ...windowRhythm('right', 0, L, { w: 0.25, h: 0.9, sill: 1.6, spacing: 2.2, margin: 1.0 }).map((o): Opening => ({ ...o, kind: 'loft' })),
    ];
    const frame = buildHouse(sink, {
      w: W, d: L, plinth: { h: 0.5, out: 0.08, bucket: 'stone' }, storeys: [{ h: 3.4, wall: 'stone' }], roof: tile ? tileHip(22) : earthRoof(0.35),
      gableBucket: 'stone', openings, chimneys: [], gutters: null, verge: null, reveal: 0.35, spall: null,
    }, dialect({ ...st, litShare: 0 }));
    if (!tile) { roller(sink, frame, look); spouts(sink, frame, ['left', 'right'], look); }
  }, -1);
  return sink.finish();
};

/**
 * The grape arbour (arisha; the props census #17, 2026-10-15, the judges: "hewn or round posts on stone bases with
 * notched beams and a lattice of rails; a vine with trunks climbing the posts and leaf clusters following the lattice;
 * a dressed stone terrace edge; destroyed: the frame racks over into its own posts and beams, and the leaves scatter"):
 * the terrace slab with its dressed edge, round posts on stone bases, the two beams laid in notches over their heads and
 * run out past them, the rails across the beams and the battens along the rails (the lattice), the old vine's trunk
 * twisting up a post and out along a beam, its leaves in clusters over the lattice and the grapes hanging under it.
 * It falls as a shed does (shedFall.ts): the posts snapped, the lattice down in lengths, the leaves thrown.
 */
const arisha: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const look = ctx.variant, mobile = ctx.tier === 'mobile';
  const fp = footprint(ctx);
  const W = Math.max(2.4, fp.w - 0.05), D = Math.max(2.4, fp.d - 0.05), H = 2.5;
  const LEAVES: readonly Rgb[] = [0x4f6a2e, 0x5f7a34, 0x3f5a26, 0x6a7a3a].map(rgb), GRAPE = rgb(0x3a2a40), BARK = rgb(0x4a3a2c);
  sink.placed(0, fp.cx, 0, fp.cz, () => {
    sink.span('stone', -W / 2, -0.3, -D / 2, W / 2, 0.2, D / 2);
    // the terrace's dressed edge: a coping course a hand proud all round its top
    sink.band('stone', -W / 2 - 0.04, 0.08, -D / 2 - 0.04, W / 2 + 0.04, 0.22, D / 2 + 0.04, { decor: true, shade: 0.92 });
    // the posts on their stone bases (the corners, and a middle one on a long side)
    const xs = W > 3.4 ? [-1, 0, 1] : [-1, 1], legs: Array<{ foot: Vec3; head: Vec3 }> = [], posts: Array<[number, number, number, number]> = [];
    for (const sz of [-1, 1]) for (const k of xs) {
      const x = k * (W / 2 - 0.15), z = sz * (D / 2 - 0.15);
      sink.span('stone', x - 0.15, 0.2, z - 0.15, x + 0.15, 0.42, z + 0.15, { shade: 0.88 });
      sink.cylinder('structureWood', [x, 0.42, z], 'y', H - 0.42, 0.08, 8, { colour: TIMBER }, 0.075);
      legs.push({ foot: [x, 0.42, z], head: [x, H, z] }); posts.push([x, z, 0.42, H]);
    }
    // the two beams in their notches over the post heads, run out past them; the rails across; the battens along
    for (const sz of [-1, 1]) sink.span('structureWood', -W / 2 - 0.15, H - 0.14, sz * (D / 2 - 0.15) - 0.07, W / 2 + 0.15, H + 0.02, sz * (D / 2 - 0.15) + 0.07, { colour: TIMBER, uv: UV_MEMBER });
    for (let x = -W / 2 + 0.3; x < W / 2 - 0.15; x += 0.55) sink.span('structureWood', x - 0.035, H + 0.02, -D / 2 - 0.1, x + 0.035, H + 0.09, D / 2 + 0.1, { colour: shade(TIMBER, 1.08), decor: true, uv: UV_MEMBER });
    sink.dressing(mobile, () => {
      for (let z = -D / 2 + 0.3; z < D / 2 - 0.15; z += 0.6) sink.span('structureWood', -W / 2, H + 0.09, z - 0.02, W / 2, H + 0.13, z + 0.02, { colour: shade(TIMBER, 1.12), decor: true, fine: true });
      // the vine: its trunk twisting up the corner post, out along the beam and over the rails
      const px = -(W / 2 - 0.15), pz = -(D / 2 - 0.15), pts: Vec3[] = [];
      for (let k = 0; k <= 5; k++) {
        const t = k / 5, a = t * Math.PI * 1.6;
        pts.push([px + Math.cos(a) * 0.13, 0.22 + t * (H - 0.3), pz + Math.sin(a) * 0.13]);
      }
      pts.push([px + W * 0.35, H + 0.16, pz + 0.1], [px + W * 0.7, H + 0.18, pz + D * 0.3], [px + W * 0.45, H + 0.17, pz + D * 0.75]);
      for (let k = 0; k + 1 < pts.length; k++) {
        const r = k < 6 ? 0.07 - k * 0.006 : 0.035;
        sink.member('structureWood', pts[k], pts[k + 1], r, r, [0, 0, 1], { colour: shade(BARK, 0.9 + look() * 0.2), decor: true, exposed: true }, 0);
      }
      // the leaves in clusters over the lattice (each a few leaves at their own tilts, seen from above and below)
      const n = Math.round(W * D * 2.6);
      for (let k = 0; k < n; k++) {
        const cx = (look() - 0.5) * (W - 0.3), cz = (look() - 0.5) * (D - 0.3), cy = H + 0.2 + look() * 0.12, colour = LEAVES[Math.floor(look() * LEAVES.length) % LEAVES.length];
        for (let j = 0; j < 3; j++) {
          const tilt = (look() - 0.5) * 1.1, yaw = look() * Math.PI * 2, r = 0.2 + look() * 0.12;
          const nrm = normalize3([Math.sin(tilt) * Math.cos(yaw), Math.cos(tilt), Math.sin(tilt) * Math.sin(yaw)]);
          const c: Vec3 = [cx + (look() - 0.5) * 0.35, cy + (look() - 0.5) * 0.08, cz + (look() - 0.5) * 0.35];
          bloomDisc(sink, c, nrm, r, shade(colour, 0.85 + look() * 0.3), { decor: true }, yaw);
          bloomDisc(sink, c, [-nrm[0], -nrm[1], -nrm[2]], r, shade(colour, 0.7), { decor: true }, yaw);
        }
        if (look() < 0.25) sink.cylinder('structureWood', [cx, H - 0.05, cz], 'y', 0.22, 0.05, 6, { colour: GRAPE, decor: true, fine: true }, 0.08);
      }
    });
    recordShed(sink, legs, {
      W: W + 0.3, D: D + 0.2, pitchDeg: 4, eaveY: H + 0.1, eave: 0.1, verge: 0.1, deck: 0.08, post: 0.16, posts,
      pad: { size: 0.3, top: 0.42, bucket: 'stone', colour: null }, timber: TIMBER, boards: null, boardW: 0.2, back: false, ends: false,
      roof: { bucket: 'structureWood', colour: LEAVES[0], shape: 'splinter', lattice: true }, stone: null, pile: 0,
    });
  });
  return sink.finish();
};

/** A house shelled in the fighting: the stone walls broken, the roof's vault fallen in, its beams. */
const shelled: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const fp = footprint(ctx);
  const W = Math.max(4, fp.w - 0.2), D = Math.max(4.5, fp.d - 0.2), t = 0.55;
  sink.placed(0, fp.cx, 0, fp.cz, () => {
    sink.span('stone', -W / 2 - 0.05, -0.4, -D / 2 - 0.05, W / 2 + 0.05, 0.35, D / 2 + 0.05);
    for (const [x0, z0, x1, z1] of [[-W / 2, -D / 2, W / 2, -D / 2 + t], [-W / 2, D / 2 - t, W / 2, D / 2], [-W / 2, -D / 2 + t, -W / 2 + t, D / 2 - t], [W / 2 - t, -D / 2 + t, W / 2, D / 2 - t]] as const) {
      const along = Math.abs(x1 - x0) > Math.abs(z1 - z0);
      for (let k = 0; k < 4; k++) {
        if (rng() < 0.25) continue;
        const a = k / 4, b = (k + 1) / 4, top = 0.9 + rng() * 3.6;
        if (along) sink.span('stone', x0 + (x1 - x0) * a, 0.35, z0, x0 + (x1 - x0) * b, top, z1);
        else sink.span('stone', x0, 0.35, z0 + (z1 - z0) * a, x1, top, z0 + (z1 - z0) * b);
      }
    }
    sink.span('stone', -W * 0.3, 0.35, -D * 0.3, W * 0.28, 1.1, D * 0.25, { decor: true });
    for (let k = 0; k < 4; k++) {
      const a: Vec3 = [(rng() - 0.5) * W * 0.7, 0.5, (rng() - 0.5) * D * 0.7];
      const b: Vec3 = [a[0] + (rng() - 0.5) * 3.0, 0.5 + rng() * 2.0, a[2] + (rng() - 0.5) * 3.0];
      sink.member('structureWood', a, b, 0.18, 0.16, [0, 1, 0], { colour: k % 2 ? CHAR : TIMBER, decor: true, exposed: true });
    }
  });
  return sink.finish();
};

export const CHOUF_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  // the dar: two storeys under red tiles, the triple arch over the door
  farmhouse: (ctx) => dar(ctx, { storeys: 2, roof: 'tile', qanatir: true }),
  rangerlodge: (ctx) => dar(ctx, { storeys: 2, roof: 'tile', qanatir: true, stair: true }),
  // the one-storey house: under the red tile as the village's 19th-century houses are (round 5, wave 251), a share
  // still under the older flat earth roof with the stair up to it
  cottage: (ctx) => {
    const earth = ctx.rng() < EARTH_SHARE;
    return dar(ctx, { storeys: 1, roof: earth ? 'earth' : 'tile', stair: earth && Math.min(footprint(ctx).w, footprint(ctx).d) >= 6.2 });
  },
  // (round 5, wave 252: "a dense village stacked on a terraced slope") the packed house of the terrace rows: one storey
  // under the flat earth roof, its back to the terrace wall, sharing its walls with its neighbours (no stair)
  adobe: (ctx) => dar(ctx, { storeys: 1, roof: 'earth' }),
  bathhouse: hammam,
  marketRow: souk,
  market: sabil,
  tavern: makeChurch(false),
  // (round 2, gauntlet wave 123: the border villages' generic tower and spire read as a Western church): their church
  // is the Chouf's own, the open bell arch on its gable; (round 5, wave 252) the village's church on the summit with its
  // campanile
  church: makeChurch(true),
  granary: store,
  barn: stable,
  woodshed: arisha,
  ruin: shelled,
});

export const CHOUF_STYLE: ArchitectureStyle = Object.freeze<ArchitectureStyle>({
  id: 'chouf',
  region: 'The Chouf on Mount Lebanon (Beiteddine, Deir el Qamar, Ain Zhalta): sandstone houses under red Marseille tiles, the triple arch, the hammam',
  surfaces: {
    // (round 2, gauntlet wave 123: the pantile's S-wave read as "corrugated-looking roofs"; the Marseille tile lies flat in
    // ribbed courses, its red brighter and more orange)
    roof: { kind: 'beavertail', tint: [0.8, 0.4, 0.25] },
    stone: { kind: 'limestone', tint: [0.84, 0.76, 0.6] },
    sourced: { plaster: false, wood: true },
    tones: {
      // the domes' limewash: a warm white
      plaster: (_h, s, l) => [0.11, Math.min(1, s * 0.25), Math.min(1, l * 1.24 + 0.1)],
    },
  },
  builders: CHOUF_BUILDERS,
  weather: {
    plaster: [[1, 1, 1], [1.0, 0.97, 0.92], [0.96, 0.95, 0.92]],
    stone: [[1, 1, 1], [0.96, 0.93, 0.88], [1.02, 0.98, 0.92], [0.92, 0.9, 0.86]],
    roof: [[1, 1, 1], [0.92, 0.88, 0.84], [1.04, 0.98, 0.94], [0.86, 0.82, 0.78]],
    damp: 0.45, moss: 0.25,
  },
  wear: 0.3,
  // the terraces' gardens: a dry stone wall round the vegetable plot, a gate, the vine arbor in a corner (yards.ts)
  yard: { kinds: ['cottage', 'farmhouse'], fence: 'wallstone', gate: 'gatestone', shed: 'woodshed', shedSize: [3.4, 3.0], garden: true },
});
