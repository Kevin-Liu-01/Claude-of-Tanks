// src/world/maps/regional/savoyard.ts — the Savoyard kit (Glacier Pass: the Col du Mont-Cenis, April 1945; map-revival
// lane 2, 2026-10-05). The high Maurienne and the pass: houses of grey gneiss rubble bedded in lime, the window and
// door openings framed in a band of whitewash, under broad low roofs of lauzes (thick split stone slabs) on heavy
// larch frames that reach far out over the gable; the hayloft's gable boarded in larch with gaps for the air; a larch
// gallery across the gable front at the upper floor; small deep windows with plank shutters; the stone stacks capped
// with a slab. The mazots — log granaries on stone mushrooms — and the open woodsheds; the long barns with their earth
// ramp up to the hayloft door; the chapels with their stone bell turrets and porches; the parish church with its
// tin-clad bulb; the old hospice of the pass, three storeys under a hipped roof; the Italian frontier guard's barracks
// (the plateau was Italian until 1947: rendered in ochre, regular windows, grey shutters); and the works of the 1930s
// Alpine line (the Vallo Alpino) — concrete blockhouses with their slit embrasures and observation cupolas. Some
// houses stand roofless after the April 1945 fighting.
import {
  LocalFrame, PartSink, faceBox, facePoint, pick, rgb, shade,
  type Face, type Rgb, type Vec3,
} from './geometry.ts';
import {
  buildHouse, emitRoof, roofGeometry, wallPolygon, windowRhythm,
  type HouseDialect, type HouseFrame, type Opening, type RoofSpec,
} from './house.ts';
import { doorUnit, gateUnit, windowUnit, type WindowStyle } from './openings.ts';
import { woodpile } from './dressing.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder } from './types.ts';

/** Larch weathered silver-brown, a darker larch, the old red and green paints, the barracks' grey-green. */
const JOINERY: readonly Rgb[] = [0x6b5a44, 0x56483a, 0x4f5f4a, 0x6e3428, 0x5f6a66].map(rgb);
const LARCH = rgb(0x5e4b38), LARCH_DARK = rgb(0x3f3328), IRON = rgb(0x26282a), TIN = rgb(0x8a9090), BELL = rgb(0x6a5a3a);
const STEEL = rgb(0x4a4e4c);
const SHINGLE = rgb(0x3e3a36);

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
/**
 * Where the walls stand: the base geometry's measured box (ctx.bounds) less the kit's own overhang on its x and z sides
 * (the coordinator's rule, 2026-10-05: a kit building fills the base's bounds, so no gap opens between two buildings).
 */
function wallsIn(ctx: RegionalBuildContext, ex: number, ez: number): { cx: number; cz: number; w: number; d: number } {
  const b = ctx.bounds;
  return { cx: (b.minX + b.maxX) / 2, cz: (b.minZ + b.maxZ) / 2, w: b.maxX - b.minX - 2 * ex, d: b.maxZ - b.minZ - 2 * ez };
}
const uvOffset = (ctx: RegionalBuildContext): [number, number] => [ctx.rng() * 7.31, ctx.rng() * 5.17];

interface SavoyardState {
  rng: () => number;
  window: WindowStyle;
  joinery: Rgb;
  door: Rgb;
  litShare: number;
  mobile: boolean;
}

function stateFor(ctx: RegionalBuildContext): SavoyardState {
  const rng = ctx.rng;
  const joinery = pick(rng, JOINERY);
  return {
    rng, joinery, door: shade(pick(rng, [LARCH, LARCH_DARK, joinery]), 0.9 + rng() * 0.15),
    window: {
      frame: shade(LARCH, 0.9), frameWidth: 0.06, frameOut: 0.04, bars: rng() < 0.7 ? 'six' : 'cross',
      // the whitewashed band round the openings of the grey stone houses (Bessans, Bonneval)
      surround: { bucket: 'plaster', width: 0.16, out: 0.012, lintel: 0.2 },
      sill: { bucket: 'stone', out: 0.08 },
      shutters: { colour: joinery, kind: 'plank', closed: 0.3 },
    },
    litShare: 0.3,
    mobile: ctx.tier === 'mobile',
  };
}

function dialect(st: SavoyardState): HouseDialect {
  return {
    window: (sink, face, o, y0) => windowUnit(sink, face, o.u, y0 + o.y0, o.w, o.h,
      o.kind === 'loft' ? { ...st.window, shutters: null, bars: 'none', surround: null } : st.window, st.rng, o.kind === 'loft' ? 0 : st.litShare),
    door: (sink, face, o, y0, frame) => {
      if (o.kind === 'gate') {
        gateUnit(sink, face, o.u, y0 + o.y0, o.w, o.h, shade(st.door, 0.9), { bucket: 'stone', width: 0.24, out: 0.06 });
        return;
      }
      // an upper door opens onto its gallery or its ramp: no steps up to it from the ground
      doorUnit(sink, face, o.u, y0 + o.y0, o.w, o.h, {
        leaf: st.door, frame: { bucket: 'plaster', width: 0.2, out: 0.012, arch: o.w > 1.25 },
        steps: o.storey === 0 ? { bucket: 'stone' } : null, leafKind: 'plank', transom: false,
      }, frame.floors[o.storey] + o.y0);
    },
  };
}

/** A lauze roof: thick split slabs on a heavy frame, low, reaching far out over the gables. */
const lauze = (pitch: number, eave: number, verge: number, kind: RoofSpec['kind'] = 'gable'): RoofSpec =>
  ({ kind, pitchDeg: pitch, eave, verge: kind === 'hip' ? eave : verge, thickness: 0.34, bucket: 'roof', ridge: 'saddle' });

/** The purlin ends and the ridge beam showing under a deep verge (the frame that carries the lauzes). */
function purlins(sink: PartSink, frame: HouseFrame, colour: Rgb): void {
  const rg = frame.roof, spec = frame.spec;
  if (rg.kind !== 'gable') return;
  const verge = spec.roof.verge;
  if (verge < 0.4) return;
  const z1 = rg.halfD + verge - 0.06;
  for (const t of [0, 0.5, 0.92]) {
    const x = rg.s * t;
    const y = rg.ridgeY - x * rg.tanP - 0.18;
    for (const side of t === 0 ? [0] : [-1, 1]) {
      sink.span('structureWood', side * x - 0.11, y - 0.2, -z1, side * x + 0.11, y, z1, { colour, decor: true, shadow: true });
    }
  }
}

/**
 * April's snow against a house (round 2, gauntlet wave 109b: "walls meeting the snow on a hard line with no drift or
 * path"): a bank along each wall of the ground storey, deeper where the wind piled it, run past the corners so the
 * banks meet there, and cut away before every ground-floor door and gate (the trodden way out); the props' snow cap
 * whitens its slope. Its foot runs 0.35 m under the floor, so on a gentle slope it meets the ground. Dressing, built
 * only on a snowbound map.
 */
function drifts(sink: PartSink, frame: HouseFrame, openings: readonly Opening[], look: () => number): void {
  const foot = -0.35;
  for (const name of ['front', 'back', 'left', 'right'] as const) {
    const face = frame.faces[name], half = face.width / 2;
    const out = 0.7 + look() * 0.3;
    const cuts = openings.filter((o) => o.face === name && o.storey === 0 && (o.kind === 'door' || o.kind === 'gate'))
      .map((o) => [o.u - o.w / 2 - 0.45, o.u + o.w / 2 + 0.45] as const).sort((a, b) => a[0] - b[0]);
    let u = -half - out * 0.8;
    const runs: Array<[number, number]> = [];
    for (const [c0, c1] of cuts) { if (c0 > u) runs.push([u, c0]); u = Math.max(u, c1); }
    if (half + out * 0.8 > u) runs.push([u, half + out * 0.8]);
    for (const [u0, u1] of runs) {
      if (u1 - u0 < 0.6) continue;
      const h0 = 0.3 + look() * 0.35, h1 = 0.3 + look() * 0.35;
      const a = facePoint(face, u0, h0, 0.01), b = facePoint(face, u1, h1, 0.01);
      const c = facePoint(face, u1, foot, out), d = facePoint(face, u0, foot, out);
      const opts = { decor: true } as const;
      sink.polygon('plaster', [a, d, c, b], opts);
      sink.polygon('plaster', [a, facePoint(face, u0, foot, 0.01), d], opts);
      sink.polygon('plaster', [b, c, facePoint(face, u1, foot, 0.01)], opts);
    }
  }
}

/**
 * The larch gallery across a gable at the upper floor: the deck on beam ends, a railing of sawn boards, the corner
 * posts carrying it to the verge.
 */
function gallery(sink: PartSink, face: Face, floorY: number, w: number, depth: number, roofY: number, colour: Rgb, fine: boolean): void {
  const c = { colour, decor: true } as const;
  faceBox(sink, 'structureWood', face, 0, floorY - 0.06, depth / 2, w, 0.12, depth, { ...c, shadow: true });
  for (const u of [-w / 2 + 0.15, 0, w / 2 - 0.15]) faceBox(sink, 'structureWood', face, u, floorY - 0.24, depth / 2, 0.16, 0.22, depth, c);
  faceBox(sink, 'structureWood', face, 0, floorY + 0.95, depth - 0.05, w, 0.09, 0.09, c);
  for (const s of [-1, 1]) {
    faceBox(sink, 'structureWood', face, s * (w / 2 - 0.05), floorY + 0.95, depth / 2, 0.09, 0.09, depth, c);
    faceBox(sink, 'structureWood', face, s * (w / 2 - 0.06), (floorY + roofY) / 2, depth - 0.06, 0.12, roofY - floorY, 0.12, c);
  }
  // the boards of the railing, each 12 cm, a gap between
  const n = Math.max(6, Math.round(w / 0.2));
  for (let k = 0; k < n; k++) {
    faceBox(sink, 'structureWood', face, -w / 2 + (k + 0.5) * w / n, floorY + 0.5, depth - 0.05, 0.12, 0.84, 0.025,
      { ...c, ...(fine ? { fine: true } : {}) }, 'caps');
  }
}

// ------------------------------------------------------------------------------------------------ the houses

/**
 * The Maurienne house (the base alpine house's plot): two storeys of rubble, the openings framed in whitewash, the
 * hayloft's gable boarded in larch, the lauze roof deep over the gables, a larch gallery across the front gable,
 * a slab-capped stack, firewood under the eaves.
 */
const maison: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const rng = st.rng, look = ctx.variant;
  const fit = wallsIn(ctx, 0.62, 0.8);
  const W = clamp(fit.w, 6.0, 9.4), D = clamp(fit.d, 7.6, 12);
  sink.placed(0, fit.cx, 0, fit.cz, () => {
    const openings: Opening[] = [
      { face: 'front', storey: 0, kind: 'door', u: (rng() - 0.5) * W * 0.3, w: 1.1, y0: 0, h: 2.05 },
      { face: 'front', storey: 1, kind: 'door', u: (rng() - 0.5) * W * 0.25, w: 0.9, y0: 0, h: 1.95 },
    ];
    for (const face of ['right', 'left'] as const) {
      for (const o of windowRhythm(face, 0, D, { w: 0.6, h: 0.75, sill: 1.0, spacing: 2.6, margin: 1.3, max: 3 })) if (rng() < 0.8) openings.push(o);
      for (const o of windowRhythm(face, 1, D, { w: 0.65, h: 0.8, sill: 0.8, spacing: 2.6, margin: 1.3, max: 3 })) if (rng() < 0.75) openings.push(o);
    }
    for (const o of windowRhythm('front', 0, W, { w: 0.6, h: 0.75, sill: 1.0, spacing: 2.2, margin: 1.0, max: 2,
      avoid: [[openings[0].u - 0.6, openings[0].u + 0.6]] })) openings.push(o);
    for (const o of windowRhythm('front', 1, W, { w: 0.65, h: 0.8, sill: 0.8, spacing: 2.2, margin: 1.0, max: 2,
      avoid: [[openings[1].u - 0.5, openings[1].u + 0.5]] })) openings.push(o);
    // the hayloft's ventilation slits in the boarded gables
    openings.push({ face: 'back', storey: 1, kind: 'loft', u: 0, w: 1.0, y0: 1.2, h: 0.6 });
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.2, out: 0.06, bucket: 'stone' }, storeys: [{ h: 2.55, wall: 'stone' }, { h: 2.35, wall: 'stone' }],
      roof: lauze(23 + rng() * 4, 0.7, 0.95), gableBucket: 'wood', openings,
      chimneys: [{ x: (rng() - 0.5) * W * 0.3, z: (rng() < 0.5 ? -1 : 1) * D * 0.18, sx: 0.7, sz: 0.7, above: 0.9, bucket: 'stone', cap: 'slab' }],
      gutters: null, verge: null, reveal: 0.42, spall: null,
    }, dialect(st));
    purlins(sink, frame, LARCH_DARK);
    if (ctx.snowCap) drifts(sink, frame, openings, look);
    const f = frame.faces.front;
    gallery(sink, f, frame.floors[1], W - 0.4, 0.95, frame.eaveY + 0.2, shade(LARCH, 0.95), true);
    sink.dressing(st.mobile, () => {
      const side = rng() < 0.5 ? frame.faces.right : frame.faces.left;
      woodpile(sink, side, -side.width / 2 + 0.6, side.width / 2 - 0.6, 1.3 + look() * 0.4, look);
    });
  });
  return sink.finish();
};

/**
 * The grange (the base log cabin's plot): a byre and hayloft of rubble under a lauze roof, the gable boarded in larch,
 * the stable door under a heavy lintel; on some, the log hayloft set on the stone byre (the mazot-built upper floor).
 */
const grange: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const rng = st.rng, look = ctx.variant;
  const fit = wallsIn(ctx, 0.42, 0.55);
  const W = clamp(fit.w, 4.6, 6.6), D = clamp(fit.d, 5.4, 7.6);
  sink.placed(0, fit.cx, 0, fit.cz, () => {
    const logs = rng() < 0.45;
    const openings: Opening[] = [
      { face: 'front', storey: 0, kind: 'door', u: (rng() - 0.5) * W * 0.25, w: 1.05, y0: 0, h: 1.85 },
      { face: 'right', storey: 0, kind: 'window', u: (rng() - 0.5) * D * 0.3, w: 0.45, h: 0.5, y0: 1.2 },
    ];
    if (!logs) openings.push({ face: 'front', storey: 0, kind: 'loft', u: 0, w: 0.8, h: 0.7, y0: 2.0 });
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: null, storeys: logs ? [{ h: 2.1, wall: 'stone' }, { h: 1.7, wall: 'wood' }] : [{ h: 2.9, wall: 'stone' }],
      roof: lauze(25 + rng() * 4, 0.5, 0.7), gableBucket: 'wood', openings,
      chimneys: [], gutters: null, verge: null, reveal: 0.38, spall: null,
    }, dialect({ ...st, litShare: 0.1 }));
    purlins(sink, frame, LARCH_DARK);
    if (ctx.snowCap) drifts(sink, frame, openings, look);
    if (logs) {
      // the log courses' ends crossing at the corners of the upper floor (the notched joints)
      const b = frame.bodies[1];
      for (let y = b.y0 + 0.12; y < b.y1; y += 0.26) {
        for (const [x, z] of [[b.x0, b.z0], [b.x1, b.z0], [b.x0, b.z1], [b.x1, b.z1]] as const) {
          sink.span('structureWood', x - 0.22, y - 0.11, z - 0.22, x + 0.22, y + 0.11, z + 0.22, { colour: shade(LARCH_DARK, 0.9 + look() * 0.2), decor: true, fine: true });
        }
      }
    }
  });
  return sink.finish();
};

/**
 * The mazot (granary): a box of larch logs raised on stone mushrooms (a post and a flat cap slab against the rats),
 * a heavy plank door with iron strap hinges, a lauze roof with deep verges.
 */
const mazot: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const look = ctx.variant;
  const fit0 = wallsIn(ctx, 0.36, 0.5), fit = { ...fit0, cz: fit0.cz - 0.35 };
  const W = clamp(fit.w, 3.0, 4.4), D = clamp(fit0.d - 0.7, 3.6, 5.4);
  sink.placed(0, fit.cx, 0, fit.cz, () => {
    const lift = 0.85;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = sx * (W / 2 - 0.3), z = sz * (D / 2 - 0.3);
      sink.cylinder('stone', [x, -0.3, z], 'y', lift + 0.15, 0.2, 7, {}, 0.17);
      sink.cylinder('stone', [x, lift - 0.15, z], 'y', 0.15, 0.42, 9, {}, 0.38);
    }
    sink.placed(0, 0, lift, 0, () => {
      const frame = buildHouse(sink, {
        w: W, d: D, plinth: null, storeys: [{ h: 2.0, wall: 'wood' }],
        roof: lauze(26, 0.4, 0.7), gableBucket: 'wood', openings: [{ face: 'front', storey: 0, kind: 'door', u: 0, w: 0.85, y0: 0, h: 1.55 }],
        chimneys: [], gutters: null, verge: null, reveal: 0.12,
      }, {
        window: () => {},
        door: (s, face, o, y0) => {
          doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: shade(LARCH_DARK, 0.9), frame: { bucket: 'structureWood', width: 0.12, out: 0.05, colour: LARCH_DARK }, steps: null, leafKind: 'plank' });
          for (const t of [0.25, 0.75]) faceBox(s, 'structureMetal', face, o.u - 0.12, y0 + o.y0 + o.h * t, 0.03, 0.55, 0.05, 0.015, { colour: IRON, decor: true, fine: true });
        },
      });
      purlins(sink, frame, LARCH_DARK);
      // the logs' notched corners
      const b = frame.bodies[0];
      for (let y = 0.12; y < 2.0; y += 0.24) {
        for (const [x, z] of [[b.x0, b.z0], [b.x1, b.z0], [b.x0, b.z1], [b.x1, b.z1]] as const) {
          sink.span('structureWood', x - 0.2, y - 0.1, z - 0.2, x + 0.2, y + 0.1, z + 0.2, { colour: shade(LARCH_DARK, 0.9 + look() * 0.2), decor: true, fine: true });
        }
      }
    });
    // the step up to the door: a stone block
    sink.span('stone', -0.5, -0.3, D / 2 + 0.05, 0.5, lift - 0.25, D / 2 + 0.7);
  });
  return sink.finish();
};

/** The open woodshed (bûcher): larch posts under a lauze lean-to, boarded on three sides, the wood stacked in it (open to +x). */
function bucher(ctx: RegionalBuildContext, yard = false): ReturnType<RegionalBuilder> {
  const sink = new PartSink(uvOffset(ctx));
  const look = ctx.variant;
  // a yard's shed opens to its +z (the yard): built in a frame turned a quarter, its plot's sides swapped
  if (yard) sink.placed(-Math.PI / 2, 0, 0, 0, () => bucherBody(sink, ctx, look, ctx.info.d, ctx.info.w));
  else bucherBody(sink, ctx, look, ctx.info.w, ctx.info.d);
  return sink.finish();
}

function bucherBody(sink: PartSink, ctx: RegionalBuildContext, look: () => number, pw: number, pd: number): void {
  const W = clamp(pw - 0.6, 2.2, 4.4), D = clamp(pd - 0.6, 2.4, 5.4);
  const hLo = 2.1, pitch = 15, rise = W * Math.tan(pitch * Math.PI / 180), hHi = hLo + rise;
  const c = { colour: shade(LARCH, 0.9) } as const;
  // the back wall (-x) and the two ends, boarded; posts at the open front
  sink.span('structureWood', -W / 2, -0.2, -D / 2, -W / 2 + 0.1, hHi, D / 2, c);
  for (const sz of [-1, 1]) {
    const end: Face = { origin: [0, 0, sz * D / 2], u: [sz, 0, 0], out: [0, 0, sz], width: W };
    wallPolygon(sink, 'wood', end, sz > 0 ? [[-W / 2, -0.2], [W / 2, -0.2], [W / 2, hLo], [-W / 2, hHi]] : [[-W / 2, -0.2], [W / 2, -0.2], [W / 2, hHi], [-W / 2, hLo]], 0.08);
  }
  for (const sz of [-1, 0, 1]) sink.span('structureWood', W / 2 - 0.16, -0.2, sz * (D / 2 - 0.1) - 0.08, W / 2, hLo, sz * (D / 2 - 0.1) + 0.08, c);
  const lean: RoofSpec = { kind: 'shed', pitchDeg: pitch, eave: 0.4, verge: 0.3, thickness: 0.18, bucket: 'roof' };
  emitRoof(sink, roofGeometry(W, D, hLo, lean), lean);
  sink.dressing(ctx.tier === 'mobile', () => {
    const back: Face = { origin: [-W / 2 + 0.1, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: D };
    woodpile(sink, back, -D / 2 + 0.2, D / 2 - 0.2, 1.4 + look() * 0.4, look);
  });
}

// ------------------------------------------------------------------------------------------------ the pass's buildings

/**
 * The chapel: rubble under white render, a lauze roof, the stone bell turret over the front gable (four piers and a
 * pyramid of lauzes, its bell), a porch on two larch posts before the door, a painted panel over it.
 */
const chapelle: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const fit = wallsIn(ctx, 0.48, 0.1);
  const W = clamp(fit.w, 4.4, 6.4), porch = 1.6, D = clamp(fit.d - porch, 5.6, 9.0);
  const zc = -porch / 2;
  sink.placed(0, fit.cx, 0, fit.cz, () => {
    const H = 4.3;
    sink.placed(0, 0, 0, zc, () => {
      const frame = buildHouse(sink, {
        w: W, d: D, plinth: { h: 0.3, out: 0.06, bucket: 'stone' }, storeys: [{ h: H, wall: 'plaster' }],
        roof: lauze(30, 0.45, 0.5), gableBucket: 'plaster',
        openings: [{ face: 'front', storey: 0, kind: 'door', u: 0, w: 1.25, y0: 0, h: 2.4 },
          { face: 'right', storey: 0, kind: 'window', u: 0, w: 0.6, h: 1.0, y0: 2.0 }, { face: 'left', storey: 0, kind: 'window', u: 0, w: 0.6, h: 1.0, y0: 2.0 }],
        chimneys: [], gutters: null, verge: null, reveal: 0.4,
      }, { ...dialect(st), door: (s, face, o, y0) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, {
        leaf: LARCH_DARK, frame: { bucket: 'stone', width: 0.24, out: 0.06, arch: true }, steps: { bucket: 'stone' }, leafKind: 'plank',
      }, y0 + o.y0) });
      if (ctx.snowCap) drifts(sink, frame, frame.spec.openings, ctx.variant);
      const f = frame.faces.front;
      // the painted panel over the door (the patron saint), its ochre frame
      faceBox(sink, 'plaster2', f, 0, 3.55, 0.012, 1.5, 1.0, 0.02, { decor: true });
      faceBox(sink, 'dark', f, 0, 3.55, 0.024, 1.2, 0.72, 0.01, { decor: true });
      // the bell turret on the front gable's apex: four stone piers, its bell, a lauze pyramid
      const ridge = frame.roof.ridgeY, tz = D / 2 - 0.65, b = 0.48;
      sink.span('stone', -b - 0.1, ridge - 0.6, tz - b - 0.1, b + 0.1, ridge + 0.25, tz + b + 0.1);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
        sink.span('stone', sx * b - 0.14, ridge + 0.25, tz + sz * b - 0.14, sx * b + 0.14, ridge + 1.45, tz + sz * b + 0.14);
      }
      sink.span('stone', -b - 0.16, ridge + 1.45, tz - b - 0.16, b + 0.16, ridge + 1.62, tz + b + 0.16);
      sink.cylinder('structureMetal', [0, ridge + 0.55, tz], 'y', 0.5, 0.26, 8, { colour: BELL, decor: true }, 0.13);
      const cap: RoofSpec = { kind: 'hip', pitchDeg: 40, eave: 0.12, verge: 0.12, thickness: 0.12, bucket: 'roof', ridge: null };
      sink.placed(0, 0, 0, tz, () => emitRoof(sink, roofGeometry(2 * b + 0.32, 2 * b + 0.32, ridge + 1.62, cap), cap));
      const tip = ridge + 1.62 + (b + 0.16) * Math.tan(40 * Math.PI / 180) + 0.12;
      sink.span('structureMetal', -0.03, tip - 0.05, tz - 0.03, 0.03, tip + 0.8, tz + 0.03, { colour: IRON, decor: true });
      sink.span('structureMetal', -0.22, tip + 0.5, tz - 0.03, 0.22, tip + 0.56, tz + 0.03, { colour: IRON, decor: true });
    });
    // the porch: two larch posts and a lauze lean-to from the front wall
    const fz = zc + D / 2, pz = fz + porch;
    for (const s of [-1, 1]) {
      sink.span('stone', s * 1.2 - 0.22, -0.3, pz - 0.42, s * 1.2 + 0.22, 0.35, pz + 0.02);
      sink.span('structureWood', s * 1.2 - 0.1, 0.35, pz - 0.3, s * 1.2 + 0.1, 2.75, pz - 0.1, { colour: LARCH });
    }
    sink.span('structureWood', -1.4, 2.6, pz - 0.32, 1.4, 2.8, pz - 0.08, { colour: LARCH_DARK, decor: true });
    const lean: RoofSpec = { kind: 'shed', pitchDeg: 18, eave: 0.25, verge: 0.3, thickness: 0.18, bucket: 'roof' };
    sink.placed(-Math.PI / 2, 0, 0, fz + porch / 2, () => emitRoof(sink, roofGeometry(porch, 2.8, 2.8, lean), lean));
    sink.span('stone', -1.5, -0.3, fz, 1.5, 0.12, pz + 0.1, { decor: true });
  });
  return sink.finish();
};

/**
 * The parish church (the base onion church's plot): a rendered nave under lauzes, a stone tower over the entrance
 * with dressed quoins and the bell stage's openings, the baroque bulb clad in tin over it, its lantern, a smaller bulb
 * and the cross (the Savoyard clocher à bulbe).
 */
const eglise: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const bb = ctx.bounds;
  const W = clamp(bb.maxX - bb.minX - 0.8, 5.6, 7.6), tower = 3.0;
  const zFront = bb.maxZ - 0.1;
  const tz = zFront - tower / 2;
  const D = clamp(zFront - tower + 0.3 - (bb.minZ + 0.35), 6.0, 9.5);
  const nz1 = zFront - tower + 0.3, nzc = nz1 - D / 2;
  const openings: Opening[] = [];
  for (const face of ['right', 'left'] as const) for (const o of windowRhythm(face, 0, D, { w: 0.7, h: 1.6, sill: 2.2, spacing: 2.4, margin: 1.2, max: 3 })) openings.push(o);
  sink.placed(0, 0, 0, nzc, () => {
    buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.35, out: 0.06, bucket: 'stone' }, storeys: [{ h: 5.0, wall: 'plaster' }],
      roof: lauze(32, 0.4, 0.35), gableBucket: 'plaster', openings, chimneys: [], gutters: null, verge: null, reveal: 0.45,
    }, { ...dialect(st), window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, {
      frame: LARCH_DARK, frameWidth: 0.05, frameOut: 0.03, bars: 'six', surround: { bucket: 'stone', width: 0.18, out: 0.05, lintel: 0.22 },
      sill: { bucket: 'stone', out: 0.1 }, shutters: null,
    }, st.rng, 0.2) });
  });
  // the tower: shaft, quoins, the bell stage, the bulb
  const half = tower / 2, shaft = 9.2;
  sink.span('stone', -half - 0.1, -0.4, tz - half - 0.1, half + 0.1, 0.5, tz + half + 0.1);
  sink.span('plaster', -half, 0.5, tz - half, half, shaft, tz + half);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    for (let y = 0.6, k = 0; y < shaft - 0.4; y += 0.52, k++) {
      const lx = k % 2 ? 0.5 : 0.28, lz = k % 2 ? 0.28 : 0.5;
      sink.quoin('stone', sx * half - sx * lx, y, tz + sz * half - sz * lz, sx * half + sx * 0.03, y + 0.46, tz + sz * half + sz * 0.03, sx, sz, { decor: true });
    }
  }
  const tf: Face = { origin: [0, 0, tz + half], u: [1, 0, 0], out: [0, 0, 1], width: tower };
  doorUnit(sink, tf, 0, 0.5, 1.3, 2.6, { leaf: LARCH_DARK, frame: { bucket: 'stone', width: 0.28, out: 0.1, arch: true }, steps: { bucket: 'stone' }, leafKind: 'plank' }, 0.5);
  faceBox(sink, 'plaster2', tf, 0, 4.4, 0.012, 1.1, 1.3, 0.02, { decor: true });
  faceBox(sink, 'dark', tf, 0, 4.4, 0.024, 0.8, 1.0, 0.01, { decor: true });
  // the bell stage: an opening on each face with its bell, a cornice over it
  const faces: Face[] = [
    { origin: [0, 0, tz + half], u: [1, 0, 0], out: [0, 0, 1], width: tower }, { origin: [0, 0, tz - half], u: [-1, 0, 0], out: [0, 0, -1], width: tower },
    { origin: [half, 0, tz], u: [0, 0, -1], out: [1, 0, 0], width: tower }, { origin: [-half, 0, tz], u: [0, 0, 1], out: [-1, 0, 0], width: tower },
  ];
  for (const fc of faces) {
    faceBox(sink, 'dark', fc, 0, shaft - 1.5, 0.006, 0.8, 1.4, 0.01, { decor: true });
    faceBox(sink, 'stone', fc, 0, shaft - 0.72, 0.04, 1.1, 0.16, 0.08, { decor: true });
  }
  sink.band('stone', -half - 0.15, shaft, tz - half - 0.15, half + 0.15, shaft + 0.3, tz + half + 0.15, { decor: true, shadow: true });
  // the bulb: a neck, the swelling bulb, the lantern, the small bulb, the spike and the cross (tin, frustum rings)
  // (round 2, wave 109b: the tin read as "a salmon-pink onion dome" under the low April sun) clad in larch shingles
  // (tavaillons), dark with age, as many of the Maurienne's bulbs are
  const ring = (y: number, h: number, r0: number, r1: number, colour: Rgb) => sink.cylinder('structureWood', [0, y, tz], 'y', h, r0, 12, { colour }, r1);
  let y = shaft + 0.3;
  const profile: Array<[number, number, number]> = [[0.4, 1.45, 1.2], [0.45, 1.2, 1.55], [0.5, 1.55, 1.62], [0.5, 1.62, 1.42], [0.45, 1.42, 0.95],
    [0.4, 0.95, 0.42], [0.5, 0.42, 0.42]];
  for (const [h, r0, r1] of profile) { ring(y, h, r0, r1, SHINGLE); y += h; }
  // the lantern: four little openings in a drum
  sink.cylinder('structureWood', [0, y, tz], 'y', 0.75, 0.5, 8, { colour: shade(SHINGLE, 0.9) }, 0.5);
  for (const fc of faces) faceBox(sink, 'dark', { ...fc, origin: [fc.origin[0] * 0.33, 0, tz + (fc.origin[2] - tz) * 0.33] }, 0, y + 0.38, 0.0, 0.2, 0.45, 0.02, { decor: true });
  y += 0.75;
  for (const [h, r0, r1] of [[0.3, 0.62, 0.72], [0.35, 0.72, 0.52], [0.35, 0.52, 0.12]] as const) { ring(y, h, r0, r1, SHINGLE); y += h; }
  sink.span('structureMetal', -0.03, y - 0.05, tz - 0.03, 0.03, y + 0.95, tz + 0.03, { colour: IRON, decor: true });
  sink.span('structureMetal', -0.24, y + 0.62, tz - 0.03, 0.24, y + 0.68, tz + 0.03, { colour: IRON, decor: true });
  sink.cylinder('structureMetal', [0, y + 0.2, tz], 'y', 0.16, 0.09, 8, { colour: rgb(0xb8933e), decor: true }, 0.09);
  return sink.finish();
};

/**
 * The hospice of the pass (the inn's plot on the north shore): three storeys of rubble under white render on a stone
 * plinth, dressed quoins, a hipped lauze roof with two stacks, rows of shuttered windows, the door in a stone frame
 * under an inscribed panel, a small bell turret on the ridge (the hospice's bell for travellers in the fog).
 */
const hospice: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const fit = wallsIn(ctx, 0.6, 0.6);
  const W = clamp(fit.w, 8.0, 11), D = clamp(fit.d, 11, 16);
  sink.placed(0, fit.cx, 0, fit.cz, () => {
    const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: 0, w: 1.6, y0: 0, h: 2.7 }];
    for (let i = 0; i < 3; i++) {
      for (const o of windowRhythm('front', i, W, { w: 0.85, h: i ? 1.3 : 1.2, sill: i ? 0.8 : 1.1, spacing: 2.2, margin: 1.1, avoid: i ? [] : [[-1.1, 1.1]] })) openings.push(o);
      for (const face of ['right', 'left'] as const) for (const o of windowRhythm(face, i, D, { w: 0.85, h: i ? 1.3 : 1.15, sill: i ? 0.8 : 1.15, spacing: 2.4, margin: 1.2 })) openings.push(o);
      for (const o of windowRhythm('back', i, W, { w: 0.8, h: 1.2, sill: 0.9, spacing: 2.6, margin: 1.2 })) openings.push(o);
    }
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.6, out: 0.08, bucket: 'stone' },
      // (round 2, wave 109b: "an isolated three-storey box with tan speckle ... no whitewashed reveals") the pass's grey
      // rubble, every opening banded in whitewash, as the village's houses
      storeys: [{ h: 3.2, wall: 'stone' }, { h: 2.9, wall: 'stone' }, { h: 2.7, wall: 'stone' }],
      roof: lauze(26, 0.55, 0.55, 'hip'), openings, gutters: null, verge: null, reveal: 0.45, spall: null,
      chimneys: [{ x: -W * 0.22, z: -D * 0.25, sx: 0.8, sz: 0.8, above: 1.0, bucket: 'stone', cap: 'slab' },
        { x: W * 0.22, z: D * 0.22, sx: 0.8, sz: 0.8, above: 1.0, bucket: 'stone', cap: 'slab' }],
    }, { ...dialect(st), window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, {
      ...st.window, surround: { bucket: 'plaster', width: 0.18, out: 0.02, lintel: 0.24 }, shutters: { colour: rgb(0x6a7270), kind: 'louvred', closed: 0.35 },
    }, st.rng, 0.35) });
    if (ctx.snowCap) drifts(sink, frame, openings, ctx.variant);
    // the way to the door: a flagged apron swept clear before it, out to the road
    const fa = frame.faces.front;
    faceBox(sink, 'stone', fa, 0, -0.12, 1.9, 3.4, 0.3, 3.4, { decor: true });
    const b0 = frame.bodies[0];
    for (const [cx, cz] of [[b0.x0, b0.z0], [b0.x1, b0.z0], [b0.x0, b0.z1], [b0.x1, b0.z1]] as const) {
      const sx = cx > 0 ? 1 : -1, sz = cz > 0 ? 1 : -1;
      for (let y = 0.7, k = 0; y < frame.eaveY - 0.5; y += 0.6, k++) {
        const lx = k % 2 ? 0.62 : 0.34, lz = k % 2 ? 0.34 : 0.62;
        sink.quoin('stone', cx - sx * lx, y, cz - sz * lz, cx + sx * 0.03, y + 0.52, cz + sz * 0.03, sx, sz, { decor: true });
      }
    }
    const f = frame.faces.front;
    faceBox(sink, 'stone', f, 0, frame.floors[0] + 3.0, 0.05, 2.0, 0.42, 0.1, { decor: true, shadow: true });
    faceBox(sink, 'dark', f, 0, frame.floors[0] + 3.0, 0.105, 1.7, 0.16, 0.01, { decor: true });
    // the bell turret astride the ridge
    const ry = frame.roof.ridgeY;
    sink.span('stone', -0.45, ry - 0.5, -0.45, 0.45, ry + 0.4, 0.45);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) sink.span('stone', sx * 0.36 - 0.1, ry + 0.4, sz * 0.36 - 0.1, sx * 0.36 + 0.1, ry + 1.3, sz * 0.36 + 0.1);
    sink.cylinder('structureMetal', [0, ry + 0.55, 0], 'y', 0.45, 0.24, 8, { colour: BELL, decor: true }, 0.12);
    const cap: RoofSpec = { kind: 'hip', pitchDeg: 38, eave: 0.1, verge: 0.1, thickness: 0.1, bucket: 'roof', ridge: null };
    emitRoof(sink, roofGeometry(1.0, 1.0, ry + 1.3, cap), cap);
  });
  return sink.finish();
};

/**
 * The frontier guard's barracks (the base lodge's plot): the Italian casermetta of the 1930s — two storeys rendered in
 * ochre on a grey stone plinth, a grey band at the floor and under the eaves, regular windows with grey shutters, a
 * concrete canopy on two piers over the door with the inscription band above it, a hipped lauze roof, a flag mast.
 */
const caserma: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const bb = ctx.bounds;
  const W = clamp(bb.maxX - bb.minX - 1.0, 9, 12.5), D = clamp(bb.maxZ - bb.minZ - 2.6, 11, 16);
  const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: 0, w: 1.8, y0: 0, h: 2.6 }];
  for (const i of [0, 1]) {
    for (const o of windowRhythm('front', i, W, { w: 1.0, h: 1.4, sill: 0.95, spacing: 2.0, margin: 1.0, avoid: i ? [] : [[-1.3, 1.3]] })) openings.push(o);
    for (const face of ['right', 'left'] as const) for (const o of windowRhythm(face, i, D, { w: 1.0, h: 1.4, sill: 0.95, spacing: 2.2, margin: 1.1 })) openings.push(o);
    for (const o of windowRhythm('back', i, W, { w: 1.0, h: 1.3, sill: 1.0, spacing: 2.4, margin: 1.2 })) openings.push(o);
  }
  const zc = bb.minZ + 0.5 + D / 2;
  sink.placed(0, (bb.minX + bb.maxX) / 2, 0, zc, () => {
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.7, out: 0.06, bucket: 'stone' }, storeys: [{ h: 3.4, wall: 'plaster2' }, { h: 3.2, wall: 'plaster2' }],
      roof: lauze(22, 0.5, 0.5, 'hip'), openings, gutters: { colour: rgb(0x55595a) }, verge: null, reveal: 0.3, spall: 'stone',
      chimneys: [{ x: 0, z: -D * 0.2, sx: 0.7, sz: 0.7, above: 0.9, bucket: 'plaster2', cap: 'slab' }],
    }, { ...dialect(st), window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, {
      frame: rgb(0xd8d4c8), frameWidth: 0.06, frameOut: 0.04, bars: 'cross', surround: { bucket: 'plaster3', width: 0.14, out: 0.02, lintel: 0.18 },
      sill: { bucket: 'stone', out: 0.08 }, shutters: { colour: rgb(0x5f6a66), kind: 'louvred', closed: 0.4 },
    }, st.rng, 0.4) });
    if (ctx.snowCap) drifts(sink, frame, openings, ctx.variant);
    const b = frame.bodies[0];
    for (const yb of [frame.floors[1], frame.eaveY - 0.25]) sink.band('plaster3', b.x0 - 0.05, yb - 0.12, b.z0 - 0.05, b.x1 + 0.05, yb + 0.12, b.z1 + 0.05, { decor: true });
    const f = frame.faces.front;
    // the canopy over the door on two piers, the inscription band over it; the piers stand at the canopy's lip, their
    // outer faces within half a metre of the plot's front (the base's reach, regionalArchitecture's footprint coverage)
    for (const s of [-1, 1]) faceBox(sink, 'plaster3', f, s * 1.45, 1.5, 1.45, 0.35, 3.0, 0.35, {});
    faceBox(sink, 'plaster3', f, 0, 3.05, 0.85, 3.6, 0.22, 1.7, { decor: true, shadow: true });
    faceBox(sink, 'plaster3', f, 0, frame.floors[1] + 0.05 + 0.6, 0.015, 4.2, 0.5, 0.03, { decor: true });
    faceBox(sink, 'dark', f, 0, frame.floors[1] + 0.05 + 0.6, 0.03, 3.6, 0.16, 0.01, { decor: true });
    // the flag mast on its iron bracket over the canopy
    faceBox(sink, 'structureMetal', f, 1.9, frame.floors[1] + 1.4, 0.35, 0.05, 0.05, 0.7, { colour: IRON, decor: true });
    sink.member('structureMetal', facePoint(f, 1.9, frame.floors[1] + 0.9, 0.12), facePoint(f, 1.9, frame.floors[1] + 4.2, 1.5), 0.06, 0.06, f.out,
      { colour: shade(TIN, 0.8), decor: true, exposed: true }, 0);
  });
  return sink.finish();
};

/**
 * The long barn (the base depot's plot): the stone byre below with its doors and slit windows, the hayloft above
 * boarded in larch, the earth ramp walled in rubble up to the hayloft's cart door on the long side, a lauze roof.
 */
const grangeLongue: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const bb = ctx.bounds;
  const W = clamp(bb.maxX - bb.minX - 3.9, 6.0, 8.0), D = clamp(bb.maxZ - bb.minZ - 1.1, 13, 21);
  const cx = bb.minX + 0.6 + W / 2;
  // the hayloft's cart door near the -z end of the right face (face u runs to -z: the door's u is -zd)
  const zd = -D * 0.25;
  const openings: Opening[] = [
    { face: 'front', storey: 0, kind: 'gate', u: 0, w: 2.2, y0: 0, h: 2.3 },
    { face: 'right', storey: 1, kind: 'gate', u: -zd, w: 2.6, y0: 0, h: 2.4 },
  ];
  for (const o of windowRhythm('left', 0, D, { w: 0.35, h: 0.6, sill: 1.3, spacing: 2.2, margin: 1.4, kind: 'loft' })) openings.push(o);
  for (const o of windowRhythm('right', 0, D, { w: 1.0, h: 1.85, sill: 0, spacing: 4.2, margin: 1.6, kind: 'door' })) {
    if (Math.abs(-o.u - zd) > 2.2 && -o.u < zd + 1.5) openings.push(o);
  }
  openings.push({ face: 'back', storey: 1, kind: 'loft', u: 0, w: 1.2, y0: 1.4, h: 0.6 });
  sink.placed(0, cx, 0, 0, () => {
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: null, storeys: [{ h: 2.7, wall: 'stone' }, { h: 2.6, wall: 'wood' }],
      roof: lauze(22, 0.6, 0.55), gableBucket: 'wood', openings, chimneys: [], gutters: null, verge: null, reveal: 0.4, spall: null,
    }, dialect({ ...st, litShare: 0.05 }));
    purlins(sink, frame, LARCH_DARK);
    if (ctx.snowCap) drifts(sink, frame, openings, ctx.variant);
    // the landing before the hayloft door and the earth ramp down to the lane, both walled in rubble
    const floorY = frame.floors[1], reach = 3.2, run = clamp(D / 2 - zd - 1.9, 4, 8.5);
    sink.span('stone', W / 2 - 0.02, -0.4, zd - 1.5, W / 2 + reach, floorY - 0.05, zd + 1.5);
    const zc = zd + 1.5 + run / 2;
    const ramp: Face = { origin: [W / 2 + reach, 0, zc], u: [0, 0, -1], out: [1, 0, 0], width: run };
    wallPolygon(sink, 'stone', ramp, [[-run / 2, -0.4], [run / 2, -0.4], [run / 2, floorY - 0.05], [-run / 2, 0.1]], reach + 0.02);
  });
  return sink.finish();
};

/**
 * A house shelled in April 1945: the rubble shell standing to broken heads, charred beams fallen in, its lauzes heaped.
 * (Round 2, gauntlet wave 109b: "the saw-tooth zigzag ruin reads as a cardboard stage flat ... it needs rubble heaps,
 * fallen lauze, charred larch and an interior".) The walls break course by course — level steps with a ragged breach,
 * not a sloped zigzag — over a slumped heap of their own rubble inside and out; the floor of the room and its hearth
 * on the gable wall show through, the lauzes lie fallen and slid against the walls, and the larch frame lies charred
 * across the heaps, a rafter or two still leaning from a wall head.
 */
const ruine: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  const fit = wallsIn(ctx, 0.05, 0.05);
  const W = clamp(fit.w, 5.0, 7.6), D = clamp(fit.d, 6.0, 9.6);
  const char = rgb(0x2a2420), charred = rgb(0x3b3029);
  sink.placed(0, fit.cx, 0, fit.cz, () => {
    const t = 0.55, H1 = 4.6;
    const faces: Array<{ face: Face; gable: boolean }> = [
      { face: { origin: [0, 0, D / 2], u: [1, 0, 0], out: [0, 0, 1], width: W }, gable: true },
      { face: { origin: [0, 0, -D / 2], u: [-1, 0, 0], out: [0, 0, -1], width: W }, gable: true },
      { face: { origin: [W / 2, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: D - 2 * t }, gable: false },
      { face: { origin: [-W / 2, 0, 0], u: [0, 0, 1], out: [-1, 0, 0], width: D - 2 * t }, gable: false },
    ];
    const heads: number[] = [];
    const walls: Array<{ face: Face; tops: number[] }> = [];
    for (const { face, gable } of faces) {
      // (round 3, gauntlet wave 127: "crenellated stepped cuts ... a toy brick wall"): the heads fall from the corners,
      // where the quoins stand longest, to the breach the shell made, never up and down again like battlements; a wall
      // the shell missed only sags. The broken head is ragged and sloping — its height taken at the ends of n strips and
      // jittered by half a metre — not cut in level courses (level steps under their snow read as merlons in pair10)
      const L = face.width, n = 9;
      const tops: number[] = [];
      const crown = Math.min(H1 * (0.7 + rng() * 0.3) + (gable ? W * 0.1 : 0), H1 + (gable ? W * 0.12 : 0));
      const dip = 0.22 + rng() * 0.6, at = 1 + rng() * (n - 2);
      for (let k = 0; k <= n; k++) {
        const d = Math.min(1, Math.abs(k - at) / Math.max(at, n - at));
        const h = crown * (dip + (1 - dip) * Math.pow(d, 0.85)) + (rng() - 0.5) * 0.5;
        tops.push(Math.max(0.64, h));
      }
      walls.push({ face, tops });
      for (let k = 0; k < n; k++) {
        const a = -L / 2 + L * k / n, b = -L / 2 + L * (k + 1) / n;
        wallPolygon(sink, 'stone', face, [[a, -0.3], [b, -0.3], [b, tops[k + 1]], [a, tops[k]]], t);
        // the head's broken stones: a few blocks proud of the break
        if (look() < 0.4) faceBox(sink, 'stone', face, a + (b - a) * (0.25 + look() * 0.5), Math.min(tops[k], tops[k + 1]) + 0.05, -t / 2, 0.3 + look() * 0.3, 0.18, t * 0.8, { decor: true });
      }
      heads.push(Math.max(...tops));
    }
    // the room's floor (beaten earth and the charred boards) and the hearth on the back gable
    sink.span('structureWood', -W / 2 + t, -0.05, -D / 2 + t, W / 2 - t, 0.06, D / 2 - t, { colour: char, decor: true });
    // (on the back gable's inner face, looking into the room: placed off the outer face, its room side was the face a
    // wall-mounted box leaves out, open to a breach)
    const hearthWall: Face = { origin: [0, 0, -D / 2 + t], u: [1, 0, 0], out: [0, 0, 1], width: W - 2 * t };
    faceBox(sink, 'stone', hearthWall, -0.6, 0.9, 0.3, 1.5, 1.8, 0.6, { decor: true });
    faceBox(sink, 'dark', hearthWall, -0.6, 0.55, 0.61, 0.9, 0.9, 0.02, { decor: true });
    // the rubble: a slumped heap inside, heaps along the walls' feet outside where their heads fell
    const heaps: Array<[number, number, number, number]> = [];
    const heap = (x: number, z: number, r: number, hgt: number) => {
      heaps.push([x, z, r, hgt]);
      sink.cylinder('stone', [x, -0.25, z], 'y', hgt + 0.25, r, 7, { decor: true, shadow: true }, r * 0.28, true, look() * 3);
    };
    heap(-W * 0.12, D * 0.08, Math.min(W, D) * 0.3, 1.1 + look() * 0.4);
    heap(W * 0.18, -D * 0.22, Math.min(W, D) * 0.2, 0.7 + look() * 0.3);
    for (const { face } of faces) {
      if (look() < 0.45) continue;
      const p = facePoint(face, (look() - 0.5) * face.width * 0.6, 0, 0.9);
      heap(p[0], p[2], 0.9 + look() * 0.6, 0.45 + look() * 0.35);
    }
    // the lauzes fallen: slabs slid against the walls and lying on the heaps
    for (let k = 0; k < 7; k++) {
      const x = (look() - 0.5) * (W - 1.6), z = (look() - 0.5) * (D - 1.6), y = 0.25 + look() * 0.9;
      const lw = 0.7 + look() * 0.5, ld = 0.5 + look() * 0.4, tilt = 0.25 + look() * 0.6, th = look() * 6.28;
      // the slab's frame: along a heading, tipped about it (ax, ay and az orthonormal)
      const c = Math.cos(th), sn = Math.sin(th), ct = Math.cos(tilt), st = Math.sin(tilt);
      const frame = new LocalFrame([c, 0, sn], [-sn * st, ct, c * st], [-sn * ct, -st, c * ct], [x, y, z]);
      sink.box('roof', [x, y, z], [lw / 2, 0.05, ld / 2], { decor: true, shadow: true }, frame);
    }
    // the larch frame burnt: beams across the heaps, a rafter or two leaning from a wall head
    for (let k = 0; k < 6; k++) {
      const a: Vec3 = [(rng() - 0.5) * W * 0.8, 0.5 + rng() * 0.5, (rng() - 0.5) * D * 0.7];
      const b: Vec3 = [a[0] + (rng() - 0.5) * 3.2, 0.4 + rng() * 1.2, a[2] + (rng() - 0.5) * 3.2];
      sink.member('structureWood', a, b, 0.2, 0.2, [0, 1, 0], { colour: k % 2 ? char : charred, decor: true, exposed: true });
    }
    for (const sx of [-1, 1]) {
      if (look() < 0.35) continue;
      const top: Vec3 = [sx * (W / 2 - t / 2), heads[sx > 0 ? 2 : 3] - 0.2, (look() - 0.5) * D * 0.4];
      const foot: Vec3 = [sx * (W / 2 - 1.9), 0.2, top[2] + (look() - 0.5) * 1.2];
      sink.member('structureWood', foot, top, 0.16, 0.18, [0, 1, 0], { colour: char, decor: true, exposed: true });
    }
    // (round 3, gauntlet wave 127: "no rubble ... no snow on its wall heads"; the heaps alone read as snow mounds) the
    // wall's own stones out on every heap, tipped every way, their faces too steep to hold the snow; and April's snow
    // lying along every broken head, a ridged cap past both faces of the wall
    for (const [hx, hz, r, hgt] of heaps) {
      const count = Math.round(4 + r * 4);
      for (let k = 0; k < count; k++) {
        const a = look() * Math.PI * 2, rho = r * (0.25 + look() * 0.75), s = 0.13 + look() * 0.17;
        const x = hx + Math.cos(a) * rho, z = hz + Math.sin(a) * rho;
        const y = -0.25 + (hgt + 0.25) * (1 - rho / r) * 0.85 + s * 0.3;
        const th = look() * 6.28, tilt = look() * 0.9, c = Math.cos(th), sn = Math.sin(th), ct = Math.cos(tilt), st = Math.sin(tilt);
        const frame = new LocalFrame([c, 0, sn], [-sn * st, ct, c * st], [-sn * ct, -st, c * ct], [x, y, z]);
        sink.box('stone', [x, y, z], [s * (1 + look() * 0.6), s * (0.55 + look() * 0.35), s * (0.7 + look() * 0.5)], { decor: true }, frame);
      }
    }
    if (ctx.snowCap) {
      for (const { face, tops } of walls) {
        const L = face.width, n = tops.length - 1;
        // one ridge the length of the wall following its broken head, its foot a hand past each face, closed at the ends
        // (a hip inset on a steep end strip turned its slope's normal into the wall: regionalArchitecture's inverted faces)
        const depth = tops.map(() => 0.12 + look() * 0.1);
        const opts = { decor: true } as const;
        for (let k = 0; k < n; k++) {
          const a = -L / 2 + L * k / n, b = -L / 2 + L * (k + 1) / n, ya = tops[k], yb = tops[k + 1];
          const fa = facePoint(face, a, ya, 0.05), fb = facePoint(face, b, yb, 0.05);
          const ba = facePoint(face, a, ya, -t - 0.05), bb = facePoint(face, b, yb, -t - 0.05);
          const ra = facePoint(face, a, ya + depth[k], -t / 2), rb = facePoint(face, b, yb + depth[k + 1], -t / 2);
          sink.polygon('plaster', [fa, fb, rb, ra], opts);
          sink.polygon('plaster', [bb, ba, ra, rb], opts);
          if (k === 0) sink.polygon('plaster', [ba, fa, ra], opts);
          if (k === n - 1) sink.polygon('plaster', [fb, bb, rb], opts);
        }
      }
    }
  });
  return sink.finish();
};

/**
 * A blockhouse of the Vallo Alpino (the base tower's plot): a squat concrete block with chamfered edges, the slit
 * embrasures with their stepped splays, a steel observation cupola on the roof slab, stones bedded on the slab, the
 * steel door at the back.
 */
const blockhaus: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const S = clamp(Math.min(ctx.info.w, ctx.info.d) - 0.2, 3.2, 3.8), h = S / 2, H = 3.1;
  sink.span('plaster3', -h - 0.25, -0.5, -h - 0.25, h + 0.25, 0.3, h + 0.25);
  sink.span('plaster3', -h, 0.3, -h, h, H, h);
  sink.span('plaster3', -h - 0.2, H, -h - 0.2, h + 0.2, H + 0.5, h + 0.2);
  // the embrasures: a dark slit in a stepped concrete splay on three faces
  const faces: Face[] = [
    { origin: [0, 0, h], u: [1, 0, 0], out: [0, 0, 1], width: S }, { origin: [h, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: S },
    { origin: [-h, 0, 0], u: [0, 0, 1], out: [-1, 0, 0], width: S },
  ];
  for (const f of faces) {
    faceBox(sink, 'plaster3', f, 0, 1.75, 0.05, 1.5, 0.75, 0.1, { decor: true });
    faceBox(sink, 'dark', f, 0, 1.75, 0.105, 1.05, 0.2, 0.01, { decor: true });
    faceBox(sink, 'plaster3', f, 0, 1.75, 0.13, 1.6, 0.06, 0.16, { decor: true, shadow: true });
  }
  // the cupola: a steel drum with its vision slits and a domed cap
  sink.cylinder('structureMetal', [0, H + 0.5, -0.2], 'y', 0.75, 0.62, 12, { colour: STEEL });
  sink.cylinder('structureMetal', [0, H + 1.25, -0.2], 'y', 0.3, 0.62, 12, { colour: STEEL }, 0.32);
  for (let k = 0; k < 6; k++) {
    const a = k * Math.PI / 3, r = 0.625;
    sink.box('dark', [Math.sin(a) * r, H + 0.95, -0.2 + Math.cos(a) * r], [0.12, 0.04, 0.012], { decor: true },
      new LocalFrame([Math.cos(a), 0, -Math.sin(a)], [0, 1, 0], [Math.sin(a), 0, Math.cos(a)], [0, 0, 0]));
  }
  // stones bedded on the slab, a steel door at the back
  const look = ctx.variant;
  for (let k = 0; k < 7; k++) {
    const x = (look() - 0.5) * (S - 0.4), z = (look() - 0.5) * (S - 0.4);
    if (Math.hypot(x, z + 0.2) < 0.95) continue;
    sink.span('stone', x - 0.2, H + 0.5, z - 0.16, x + 0.2, H + 0.5 + 0.12 + look() * 0.12, z + 0.16, { decor: true });
  }
  const back: Face = { origin: [0, 0, -h], u: [-1, 0, 0], out: [0, 0, -1], width: S };
  faceBox(sink, 'structureMetal', back, 0, 1.25, 0.03, 0.9, 1.9, 0.05, { colour: STEEL, decor: true });
  faceBox(sink, 'plaster3', back, 0, 2.35, 0.1, 1.3, 0.2, 0.2, { decor: true });
  return sink.finish();
};

export const SAVOYARD_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  alpine: maison,
  logcabin: grange,
  granary: mazot,
  woodshed: (ctx) => bucher(ctx),
  // the yards' outbuilding: the woodshed opening into the yard
  yardshed: (ctx) => bucher(ctx, true),
  chapel: chapelle,
  onionchurch: eglise,
  tavern: hospice,
  rangerlodge: caserma,
  depot: grangeLongue,
  ruin: ruine,
  tower: blockhaus,
});

/** the roughcast of the Maurienne: a grey-white lime, not a southern whitewash */
const crepi = (_h: number, s: number, l: number): readonly [number, number, number] => [0.1, Math.min(1, s * 0.08), Math.min(1, l * 1.08 + 0.08)];

export const SAVOYARD_STYLE: ArchitectureStyle = Object.freeze<ArchitectureStyle>({
  id: 'savoyard',
  region: 'Haute-Maurienne and the Col du Mont-Cenis (Savoie), 1945: gneiss rubble under lauze roofs, larch galleries and mazots, the Vallo Alpino blockhouses',
  surfaces: {
    // lauzes: thick split slabs of the valley's schist and gneiss, grey with a brown cast
    // (round 2, wave 109b: "thin beige roofs") the schist's blue-grey
    roof: { kind: 'slate', tint: [0.38, 0.39, 0.41] },
    // the grey gneiss rubble bedded in lime
    // (round 2, wave 109b: "one warm tan texture on every box") grey gneiss rubble in a dark lime mortar
    // (round 3, wave 127: the shelled house still "a clean tan, regularly brick-tiled wall"): the stones laid as rubble,
    // split and pillowed in uneven courses, not as coursed greywacke; a cool blue-grey under the low April sun
    stone: { kind: 'rubble', tint: [0.4, 0.43, 0.5] },
    sourced: { plaster: false, wood: true },
    tones: {
      plaster: crepi,
      // the frontier guard's ochre
      // (round 2, wave 109b: "saturated mustard reads plastic") a lime ochre, sun-faded
      plaster2: (_h, s, l) => [0.1, Math.min(1, 0.2 + s * 0.25), Math.min(1, l * 0.8 + 0.12)],
      // the Vallo Alpino's concrete
      plaster3: (_h, s, l) => [0.11, Math.min(1, 0.04 + s * 0.1), Math.min(1, l * 0.72 + 0.1)],
      // larch weathered silver-brown
      wood: (h, s, l) => [h, Math.min(1, s * 0.75), Math.min(1, l * 0.82)],
    },
  },
  builders: SAVOYARD_BUILDERS,
  // the long winters: damp at the wall foot, lichen on the lauzes
  weather: {
    plaster: [[1, 1, 1], [0.97, 0.96, 0.94], [0.94, 0.94, 0.93], [1.0, 0.98, 0.95]],
    // (round 3) the stone's weathering cool: the gneiss greys and blues, never the warm sandstone's buffs
    stone: [[1, 1, 1], [0.92, 0.94, 0.97], [0.97, 0.98, 1.0], [0.86, 0.88, 0.91]],
    roof: [[1, 1, 1], [0.9, 0.88, 0.84], [1.06, 1.03, 0.98], [0.84, 0.83, 0.82]],
    damp: 0.75, moss: 0.5, mossTint: [0.96, 0.94, 0.8],
  },
  wear: 0.3,
  // the yards: a fence of split larch round the woodshed (no kitchen garden under the April snow)
  yard: { kinds: ['alpine', 'logcabin'], fence: 'fenceplank', gate: 'gate', shed: 'yardshed', shedSize: [3.6, 3.0], garden: false },
});
