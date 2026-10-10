// src/world/maps/regional/sarajevoCivic.ts — the Sarajevo kit's public buildings and places of worship (sarajevo.ts), each
// in the footprint of the landmark it replaces:
//   - civichall on the boulevard → the National Museum's neo-Renaissance pavilion (Zemaljski muzej): a rusticated
//     ground storey, the piano nobile under its cornice, corner pavilions, the entrance pavilion's pediment and its
//     copper dome holed by a shell; up the slope → the City Hall and National Library (Vijećnica), the pseudo-Moorish
//     block of ochre and red bands with horseshoe arches, crenellated parapet and corner turrets, burnt out on 25-26
//     August 1992 — its central hall's dome down to its bare ribs;
//   - firestation → a mahala mosque: the prayer hall of stone or whitewash under a lead dome or a hipped tile roof, its
//     portico of arches on slender columns, the pencil minaret with its balcony and lead cone, the harem's white nišani
//     inside a low wall;
//   - factory → a Serbian Orthodox church: the nave under copper, a drum and dome over its centre, the apse, the bell
//     tower over the west door, bands of red across the render;
//   - foundryoffice → a Catholic church: a neo-Gothic nave of stone with lancets between buttresses under a steep tile
//     roof, the tower and its spire over the door;
//   - warehouse → the Austro-Hungarian market hall: an ochre hall with tall arched windows in two tiers, the great
//     arched entrance in the gable under a clock, a clerestory lantern along the ridge;
//   - depot → a čaršija row: single-storey timber shops under one deep-eaved tile roof, their ćepenci (shutters)
//     closed for the siege, a whitewashed han storey over one end.
import { PartSink, faceBox, facePanel, facePoint, rgb, shade, type Face, type RegionalBucket, type RegionalParts, type Rgb, type Vec3 } from './geometry.ts';
import { buildHouse, emitRoof, roofGeometry, windowRhythm, type HouseDialect, type Opening, type RoofSpec } from './house.ts';
import { doorUnit, gateUnit, windowUnit, type WindowStyle } from './openings.ts';
import type { RegionalBuildContext, RegionalBuilder } from './types.ts';
import {
  AH_FRAME, CHAR, COPPER, DARK_FRAME, DOOR_LEAVES, IRON, LEAD, TIMBER, ZINC,
  archHead, choose, clampTo, fillOf, nisan, pediment, shellHole, shellPocks,
} from './sarajevoParts.ts';

function uvOffset(ctx: RegionalBuildContext): [number, number] {
  return [ctx.rng() * 7.31, ctx.rng() * 5.17];
}

const RED_BAND = rgb(0x9a4632), GILT = rgb(0xb8933e);

const STONE_WINDOW: WindowStyle = {
  frame: AH_FRAME, frameWidth: 0.07, frameOut: 0.05, bars: 'cross',
  surround: { bucket: 'stone', width: 0.18, out: 0.07, lintel: 0.26 }, sill: { bucket: 'stone', out: 0.12 }, shutters: null,
};

/** A dome of sheet metal over (x, y0, z): a hemisphere of radius r as stacked rings, its finial on top. */
function dome(sink: PartSink, x: number, y0: number, z: number, r: number, colour: Rgb, segments = 12, decor = false): number {
  const rings = [[1, 0.92, 0.36], [0.92, 0.72, 0.32], [0.72, 0.4, 0.26], [0.4, 0.04, 0.14]] as const;
  let y = y0;
  for (const [a, b, h] of rings) {
    sink.cylinder('structureMetal', [x, y, z], 'y', r * h, r * a, segments, { colour, ...(decor ? { decor: true } : {}) }, r * b, true);
    y += r * h;
  }
  return y;
}

/** A finial: a slim mast with a cross (church) or the alem's balls and crescent (mosque). */
function finial(sink: PartSink, x: number, y: number, z: number, kind: 'cross' | 'alem', scale = 1): void {
  const c = { colour: GILT, decor: true } as const;
  sink.cylinder('structureMetal', [x, y - 0.1, z], 'y', 1.6 * scale, 0.04 * scale, 5, c);
  if (kind === 'cross') {
    sink.span('structureMetal', x - 0.04 * scale, y + 0.9 * scale, z - 0.35 * scale, x + 0.04 * scale, y + 1.0 * scale, z + 0.35 * scale, c);
    return;
  }
  for (const [h, r] of [[0.45, 0.14], [0.85, 0.11]] as const) sink.cylinder('structureMetal', [x, y + h * scale - r * scale, z], 'y', r * 2 * scale, r * scale, 6, c, r * scale);
  sink.span('structureMetal', x - 0.03, y + 1.25 * scale, z - 0.18 * scale, x + 0.03, y + 1.55 * scale, z + 0.18 * scale, c);
}

// ------------------------------------------------------------------------------------------------ the museum

/** The museum's neo-Renaissance pavilion (turned: its long front faces the boulevard, +z). */
function museum(ctx: RegionalBuildContext): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const f = fillOf(ctx.bounds, 0.15);
  sink.placed(0, f.cx, 0, f.cz, () => {
    const rng = ctx.rng, look = ctx.variant, mobile = ctx.tier === 'mobile';
    const W = clampTo(f.w, 6, 60), D = clampTo(f.d, 6, 60);
    // (the corner pavilions stand 0.7 m proud of the front under 0.4 m eaves: the entrance pavilion at least as far)
    const rw = clampTo(W * 0.14, 1.4, 4.6), proj = clampTo(D * 0.09, 1.1, 2.0), pw = clampTo(W * 0.16, 1.5, 5.4), dr = clampTo(rw * 0.72, 1.0, 3.3);
    // the hipped roof's eave at the lot's back and side edges, the entrance pavilion's pediment at its street edge
    const bd = clampTo(D - 0.6 - proj, 4, 24), bz = -D / 2 + 0.6 + bd / 2;
    const g0 = 5.0, g1 = 5.4;
    const door = choose(rng(), DOOR_LEAVES);
    const openings: Opening[] = [];
    for (const o of windowRhythm('left', 0, W, { w: 1.5, h: 2.5, sill: 1.1, spacing: 3.6, margin: 2.2, avoid: [[-3.4, 3.4]] })) openings.push(o);
    for (const o of windowRhythm('left', 1, W, { w: 1.55, h: 3.0, sill: 0.8, spacing: 3.6, margin: 2.2, avoid: [[-3.4, 3.4]] })) openings.push(o);
    for (const i of [0, 1]) for (const o of windowRhythm('right', i, W, { w: 1.4, h: 2.4, sill: 1.1, spacing: 3.6, margin: 1.6 })) openings.push(o);
    for (const face of ['front', 'back'] as const) for (const i of [0, 1]) for (const o of windowRhythm(face, i, bd, { w: 1.4, h: 2.4, sill: 1.1, spacing: 3.4, margin: 1.4 })) openings.push(o);
    const dialect: HouseDialect = {
      window: (s, face, o, y0) => {
        windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, STONE_WINDOW, look, 0.06);
        if (o.storey === 0 && face.out[0] < -0.5) archHead(s, face, o.u, y0 + o.y0 + o.h + 0.26, o.w / 2 + 0.18, 'stone', 0.2, 6);
      },
      door: (s, face, o, y0, frame) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: door, frame: { bucket: 'stone', width: 0.3, out: 0.1, arch: true }, transom: true,
        steps: { bucket: 'stone' }, leafKind: 'panel' }, frame.floors[o.storey] + o.y0),
    };
    sink.placed(Math.PI / 2, 0, 0, 0, () => sink.placed(0, -bz, 0, 0, () => {
      const frame = buildHouse(sink, {
        w: bd, d: W - 1.2, plinth: { h: 0.6, out: 0.08, bucket: 'stone' }, storeys: [{ h: g0, wall: 'stone' }, { h: g1, wall: 'plaster' }],
        roof: { kind: 'hip', pitchDeg: 27, eave: 0.6, verge: 0.6, thickness: 0.18, bucket: 'roof', ridge: 'saddle' }, gableBucket: 'plaster', openings,
        chimneys: [], gutters: { colour: ZINC }, verge: null, reveal: 0.3, rafters: null, spall: 'stone',
      }, dialect);
      const b = frame.bodies[0], eave = frame.eaveY;
      sink.band('stone', b.x0 - 0.1, frame.floors[1] - 0.3, b.z0 - 0.1, b.x1 + 0.1, frame.floors[1], b.z1 + 0.1, { decor: true });
      sink.band('stone', b.x0 - 0.3, eave - 0.7, b.z0 - 0.3, b.x1 + 0.3, eave - 0.1, b.z1 + 0.3, { decor: true });
      // the piano nobile's pediments
      const street = frame.faces.left;
      for (const o of openings) if (o.face === 'left' && o.storey === 1 && !o.state) pediment(sink, street, o.u, frame.floors[1] + o.y0 + o.h + 0.28, o.w + 0.7, 0.42);
      // the corner pavilions: a storey taller, under their own hipped roofs
      for (const s of [-1, 1]) {
        const pz0 = s > 0 ? b.z1 - pw : b.z0, pz1 = pz0 + pw, ph = eave + 1.6;
        // (flush with the back wall: their roofs' eaves stay inside the main roof's)
        sink.span('plaster', b.x0 - 0.7, 0, pz0, b.x1, ph, pz1);
        sink.band('stone', b.x0 - 0.9, ph - 0.6, pz0 - 0.15, b.x1 + 0.2, ph, pz1 + 0.15, { decor: true });
        const cap: RoofSpec = { kind: 'hip', pitchDeg: 34, eave: 0.4, verge: 0.4, thickness: 0.16, bucket: 'roof', ridge: 'saddle' };
        sink.placed(0, (b.x0 - 0.7 + b.x1) / 2, 0, (pz0 + pz1) / 2, () => emitRoof(sink, roofGeometry(b.x1 - b.x0 + 0.7, pw, ph, { ...cap, verge: 0.4 }), cap));
        const pf: Face = { origin: [b.x0 - 0.7, 0, (pz0 + pz1) / 2], u: [0, 0, 1], out: [-1, 0, 0], width: pw };
        for (const y of [1.4, g0 + 0.9, eave - 0.2]) windowUnit(sink, pf, 0, y, 1.4, y > eave - 1 ? 1.2 : 2.4, STONE_WINDOW, look, 0.05);
      }
      // the entrance pavilion: taller, its pediment, the portal, the drum and the dome behind
      const ex0 = b.x0 - (proj - 0.35), rh = eave + 3.4;
      sink.span('plaster', ex0, 0, -rw, b.x0 + dr, rh, rw);
      const ef: Face = { origin: [ex0, 0, 0], u: [0, 0, 1], out: [-1, 0, 0], width: 2 * rw };
      for (const du of [-0.9, -0.35, 0.35, 0.9]) faceBox(sink, 'stone', ef, du * rw, rh / 2, 0.12, 0.62, rh - 0.6, 0.24, { decor: true, fineSides: true });
      faceBox(sink, 'stone', ef, 0, rh - 0.35, 0.2, 2 * rw + 0.4, 0.7, 0.4, { decor: true });
      const ped = [[-rw - 0.2, rh], [rw + 0.2, rh], [0, rh + rw * 0.48]] as const;
      sink.prism('stone', ped.map(([u, y]) => facePoint(ef, u, y, 0)), ef.out, 0.35);
      faceBox(sink, 'structureWood', ef, 0, 1.9, 0.02, 2.2, 3.8, 0.06, { colour: door, decor: true });
      archHead(sink, ef, 0, 3.8, 1.1, 'stone', 0.28);
      if (rw > 3.2) for (const du of [-0.63, 0.63]) for (const y of [1.6, g0 + 1.0]) windowUnit(sink, ef, du * rw, y, 1.2, 2.5, STONE_WINDOW, look, 0.05);
      for (let k = 1; k <= 3; k++) sink.span('stone', ex0 - 0.45 * k, -0.3, -rw * 0.56 - 0.3 * k, ex0 - 0.45 * (k - 1), 0.6 - k * 0.15, rw * 0.56 + 0.3 * k, { decor: true });
      const dx = b.x0 + dr * 0.73, top = rh + 0.4;
      sink.cylinder('plaster', [dx, rh - 0.5, 0], 'y', 3.1, dr, 8, {}, dr, true, Math.PI / 8);
      const dtop = dome(sink, dx, top + 2.2, 0, dr, COPPER, 12);
      sink.cylinder('structureMetal', [dx, dtop - 0.05, 0], 'y', 1.3, 0.5, 6, { colour: COPPER, decor: true }, 0.35);
      finial(sink, dx, dtop + 1.25, 0, 'cross', 0.8);
      // the shell's hole in the dome: the dark ragged breach, the copper's ribs across it
      const hole: Vec3[] = [];
      for (let j = 0; j < 7; j++) {
        const t = (j / 7) * Math.PI * 2, r = 0.8 + look() * 0.5;
        hole.push([dx - dr * 0.91 + Math.cos(t) * 0.12, top + 2.2 + dr * 0.36 + Math.sin(t) * r * dr / 3.3, Math.cos(t) * r * dr / 3.3]);
      }
      sink.polygon('dark', hole, { decor: true });
      sink.dressing(mobile, () => {
        shellPocks(sink, street, { u0: -W / 2 + 1, u1: W / 2 - 1, y0: 0.8, y1: eave - 1 }, 40 + Math.floor(look() * 30),
          openings.filter((o) => o.face === 'left').map((o) => ({ u0: o.u - o.w / 2 - 0.3, u1: o.u + o.w / 2 + 0.3, y0: frame.floors[o.storey] + o.y0 - 0.2, y1: frame.floors[o.storey] + o.y0 + o.h + 0.9 })), look, 'stone');
      });
    }));
  });
  return sink.finish();
}

// ------------------------------------------------------------------------------------------------ the Vijećnica

/** The City Hall and National Library: pseudo-Moorish bands and arches, crenellations, turrets, the burnt hall. */
function vijecnica(ctx: RegionalBuildContext): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const f = fillOf(ctx.bounds, 0.2);
  sink.placed(0, f.cx, 0, f.cz, () => {
    const rng = ctx.rng, look = ctx.variant, mobile = ctx.tier === 'mobile';
    // the corner turrets stand out of the walls by 0.46 of their radius: the walls stand in by that, the turrets on the fill
    const tr = clampTo(Math.min(f.w, f.d) * 0.07, 0.6, 1.3);
    const W = clampTo(f.w - 0.92 * tr, 6, 60), D = clampTo(f.d - 0.92 * tr, 6, 60);
    const sts = [5.0, 4.4, 4.4];
    const door = choose(rng(), DOOR_LEAVES);
    const openings: Opening[] = [{ face: 'left', storey: 0, kind: 'gate', u: 0, w: 3.0, y0: 0, h: 3.6 }];
    for (let i = 0; i < 3; i++) {
      const w = i === 0 ? 1.4 : 1.3, h = i === 0 ? 2.3 : 2.0, sill = i === 0 ? 1.2 : 0.8;
      for (const face of ['left', 'right'] as const) for (const o of windowRhythm(face, i, W, { w, h, sill, spacing: 3.3, margin: 2.0, avoid: face === 'left' && i === 0 ? [[-2.2, 2.2]] : [] })) openings.push(o);
      for (const face of ['front', 'back'] as const) for (const o of windowRhythm(face, i, D, { w, h, sill, spacing: 3.3, margin: 2.0 })) openings.push(o);
    }
    // the fire: most of the upper storeys' windows gutted
    for (const o of openings) if (o.storey > 0 && o.kind === 'window' && look() < 0.55) o.state = 'burnt';
    const dialect: HouseDialect = {
      window: (s, face, o, y0) => {
        windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { ...STONE_WINDOW, surround: null, bars: 'two' }, look, 0.04);
        archHead(s, face, o.u, y0 + o.y0 + o.h, o.w / 2, 'stone', 0.18, 6);
      },
      door: (s, face, o, y0) => {
        gateUnit(s, face, o.u, y0 + o.y0, o.w, o.h, door, { bucket: 'stone', width: 0.35, out: 0.12 });
        archHead(s, face, o.u, y0 + o.y0 + o.h, o.w / 2 + 0.15, 'stone', 0.4, 8);
      },
    };
    sink.placed(Math.PI / 2, 0, 0, 0, () => {
      const frame = buildHouse(sink, {
        w: D, d: W, plinth: { h: 0.5, out: 0.08, bucket: 'stone' }, storeys: sts.map((h) => ({ h, wall: 'plaster2' as RegionalBucket })),
        roof: { kind: 'flat', pitchDeg: 0, eave: 0.1, verge: 0.1, thickness: 0.35, bucket: 'stone', parapet: 1.0 }, gableBucket: 'plaster2', openings,
        chimneys: [], gutters: null, verge: null, reveal: 0.3, rafters: null, spall: 'stone',
      }, dialect);
      const b = frame.bodies[0], eave = frame.eaveY;
      // the red bands in the solid zones between the storeys' arches
      for (let i = 0; i < 3; i++) {
        const zone0 = frame.floors[i] + (i === 0 ? 1.2 + 2.3 + 0.9 : 0.8 + 2.0 + 0.85), zone1 = (i < 2 ? frame.floors[i + 1] : eave) + 0.6;
        for (let y = zone0; y + 0.24 < zone1; y += 0.62) sink.band('structureMetal', b.x0 - 0.03, y, b.z0 - 0.03, b.x1 + 0.03, y + 0.24, b.z1 + 0.03, { decor: true, colour: RED_BAND });
      }
      for (let y = 0.7; y < 1.1; y += 0.62) sink.band('structureMetal', b.x0 - 0.03, y, b.z0 - 0.03, b.x1 + 0.03, y + 0.24, b.z1 + 0.03, { decor: true, colour: RED_BAND });
      // the crenellation along the parapet head
      const ph = eave + 0.35 + 1.0;
      if (!mobile) {
        const merlon = (x0: number, z0: number, x1: number, z1: number) => sink.span('plaster2', x0, ph, z0, x1, ph + 0.62, z1, { decor: true });
        for (let z = b.z0 + 0.6; z < b.z1 - 0.4; z += 1.1) { merlon(b.x0 - 0.1, z, b.x0 + 0.12, z + 0.5); merlon(b.x1 - 0.12, z, b.x1 + 0.1, z + 0.5); }
        for (let x = b.x0 + 0.6; x < b.x1 - 0.4; x += 1.1) { merlon(x, b.z0 - 0.1, x + 0.5, b.z0 + 0.12); merlon(x, b.z1 - 0.12, x + 0.5, b.z1 + 0.1); }
      }
      // the corner turrets and their little domes
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const x = sx > 0 ? b.x1 - tr * 0.54 : b.x0 + tr * 0.54, z = sz > 0 ? b.z1 - tr * 0.54 : b.z0 + tr * 0.54;
        sink.cylinder('plaster2', [x, -0.3, z], 'y', ph + 2.4, tr, 8, {}, tr, true, Math.PI / 8);
        sink.band('structureMetal', x - tr - 0.06, ph - 0.3, z - tr - 0.06, x + tr + 0.06, ph, z + tr + 0.06, { decor: true, colour: RED_BAND });
        const t = dome(sink, x, ph + 2.1, z, tr, LEAD, 8, true);
        finial(sink, x, t, z, 'alem', 0.5);
      }
      // the central hall: its octagonal drum over the roof, the burnt dome's bare ribs, a few panes left
      const hr = clampTo(Math.min(b.x1 - b.x0, b.z1 - b.z0) * 0.26, 2.5, 5.2), hy = eave + 0.35;
      sink.cylinder('plaster2', [0, hy - 0.2, 0], 'y', 3.6, hr, 8, {}, hr, true, Math.PI / 8);
      sink.band('structureMetal', -hr - 0.06, hy + 2.2, -hr - 0.06, hr + 0.06, hy + 2.5, hr + 0.06, { decor: true, colour: RED_BAND });
      const ribTop: Vec3 = [0, hy + 3.4 + hr * 0.8, 0];
      for (let k = 0; k < 8; k++) {
        const t = (k / 8) * Math.PI * 2 + Math.PI / 8;
        const a: Vec3 = [Math.cos(t) * hr * 0.92, hy + 3.4, Math.sin(t) * hr * 0.92];
        const m: Vec3 = [Math.cos(t) * hr * 0.66, hy + 3.4 + hr * 0.62, Math.sin(t) * hr * 0.66];
        sink.member('structureMetal', a, m, 0.14, 0.14, [Math.cos(t), 0.3, Math.sin(t)], { colour: CHAR, decor: true, exposed: true }, 0);
        sink.member('structureMetal', m, ribTop, 0.12, 0.12, [Math.cos(t), 1, Math.sin(t)], { colour: CHAR, decor: true, exposed: true }, 0);
      }
      sink.cylinder('structureMetal', [0, hy + 3.4, 0], 'y', 0.2, hr * 0.95, 8, { colour: CHAR, decor: true }, hr * 0.95, true, Math.PI / 8);
      const street = frame.faces.left;
      sink.dressing(mobile, () => shellPocks(sink, street, { u0: -W / 2 + 1, u1: W / 2 - 1, y0: 0.6, y1: eave - 0.5 }, 30 + Math.floor(look() * 20),
        openings.filter((o) => o.face === 'left').map((o) => ({ u0: o.u - o.w / 2 - 0.3, u1: o.u + o.w / 2 + 0.3, y0: frame.floors[o.storey] + o.y0 - 0.2, y1: frame.floors[o.storey] + o.y0 + o.h + o.w / 2 + 0.4 })), look, 'stone'));
    });
  });
  return sink.finish();
}

const civicHall: RegionalBuilder = (ctx) => {
  const valley = ctx.z !== undefined ? Math.abs(ctx.z) < 60 : ctx.rng() < 0.5;
  return valley ? museum(ctx) : vijecnica(ctx);
};

// ------------------------------------------------------------------------------------------------ the mosque

/**
 * A mahala mosque: the prayer hall (stone under a lead dome, or whitewashed under a hipped tile roof) at the back of
 * the plot, the portico of arches on slender columns before its door, the pencil minaret at its corner, the harem's
 * nišani inside a low wall along the street.
 */
const mosque: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const f = fillOf(ctx.bounds, 0.1);
  sink.placed(0, f.cx, 0, f.cz, () => {
    const rng = ctx.rng, look = ctx.variant, mobile = ctx.tier === 'mobile';
    const W = clampTo(f.w, 6, 40), D = clampTo(f.d, 7, 40);
    const domed = rng() < 0.55;
    const hs = clampTo(Math.min(W - 3.2, D * 0.6), 5, 10), hh = clampTo(hs * 0.82, 4.5, 8);
    // the hall's eave on the lot's back edge
    const hz0 = -D / 2 + (domed ? 0.25 : 0.7), hz1 = hz0 + hs, hzc = (hz0 + hz1) / 2;
    const wall: RegionalBucket = domed || rng() < 0.4 ? 'stone' : 'plaster';
    const door = choose(rng(), DOOR_LEAVES);
    const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: 0, w: 1.3, y0: 0, h: 2.5 }];
    for (const face of ['left', 'right', 'back'] as const) {
      for (const o of windowRhythm(face, 0, hs, { w: 0.9, h: 1.5, sill: 0.9, spacing: 2.4, margin: 1.2, max: 3 })) openings.push(o);
      for (const o of windowRhythm(face, 0, hs, { w: 0.55, h: 0.8, sill: hh - 1.7, spacing: 2.4, margin: 1.2, max: 3 })) openings.push(o);
    }
    for (const o of windowRhythm('front', 0, hs, { w: 0.9, h: 1.5, sill: 0.9, spacing: 2.6, margin: 1.0, avoid: [[-1.2, 1.2]], max: 2 })) openings.push(o);
    const dialect: HouseDialect = {
      window: (s, face, o, y0) => {
        const y = y0 + o.y0;
        windowUnit(s, face, o.u, y, o.w, o.h, { frame: DARK_FRAME, frameWidth: 0.05, frameOut: 0.04, bars: 'none', surround: { bucket: 'stone', width: 0.14, out: 0.05, lintel: 0.14 }, sill: { bucket: 'stone', out: 0.1 }, shutters: null }, look, 0.05);
        if (o.h > 1) for (let k = 1; k < 4; k++) faceBox(s, 'structureWood', face, o.u - o.w / 2 + o.w * k / 4, y + o.h / 2, 0.03, 0.025, o.h, 0.025, { colour: IRON, decor: true, fine: true });
        archHead(s, face, o.u, y + o.h + 0.14, o.w / 2 + 0.06, 'stone', 0.12, o.h > 1 ? 2 : 6);
      },
      door: (s, face, o, y0, frame) => {
        doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: door, frame: { bucket: 'stone', width: 0.22, out: 0.08 }, steps: { bucket: 'stone' }, leafKind: 'plank' }, frame.floors[o.storey] + o.y0);
        archHead(s, face, o.u, y0 + o.y0 + o.h + 0.22, o.w / 2 + 0.22, 'stone', 0.2, 2);
      },
    };
    sink.placed(0, 0, 0, hzc, () => {
      const frame = buildHouse(sink, {
        w: hs, d: hs, plinth: { h: 0.35, out: 0.06, bucket: 'stone' }, storeys: [{ h: hh, wall }],
        roof: domed ? { kind: 'flat', pitchDeg: 0, eave: 0.25, verge: 0.25, thickness: 0.3, bucket: 'stone' }
          : { kind: 'hip', pitchDeg: 26, eave: 0.7, verge: 0.7, thickness: 0.16, bucket: 'roof', ridge: 'round' },
        gableBucket: wall, openings, chimneys: [], gutters: null, verge: null, reveal: 0.36, rafters: null, spall: 'stone',
      }, dialect);
      if (domed) {
        const top = frame.eaveY + 0.3;
        sink.cylinder(wall, [0, top - 0.05, 0], 'y', 0.9, hs * 0.44, 8, {}, hs * 0.42, true, Math.PI / 8);
        const t = dome(sink, 0, top + 0.85, 0, hs * 0.42, LEAD, 12);
        finial(sink, 0, t, 0, 'alem', 0.9);
      } else finial(sink, 0, frame.roof.ridgeTopY + 0.05, 0, 'alem', 0.7);
    });
    // the portico before the door: a stone platform, slender columns, arches, a lead-sheeted lean-to roof
    const pz0 = hz1, pz1 = Math.min(D / 2 - 2.2, hz1 + 3.2);
    if (pz1 - pz0 > 1.6) {
      const px = hs / 2 - 0.1, ph = Math.min(hh - 0.4, 4.0);
      sink.span('stone', -px, -0.3, pz0, px, 0.35, pz1);
      const cols = Math.max(3, Math.round(hs / 2.4) + 1);
      for (let k = 0; k < cols; k++) {
        const x = -px + 0.25 + (2 * px - 0.5) * k / (cols - 1);
        sink.cylinder('stone', [x, 0.35, pz1 - 0.3], 'y', ph - 0.35, 0.2, 8, {}, 0.18);
      }
      const pf: Face = { origin: [0, 0, pz1 - 0.3], u: [1, 0, 0], out: [0, 0, 1], width: 2 * px };
      for (let k = 0; k + 1 < cols; k++) {
        const x0 = -px + 0.25 + (2 * px - 0.5) * k / (cols - 1), x1 = -px + 0.25 + (2 * px - 0.5) * (k + 1) / (cols - 1);
        const r = (x1 - x0) / 2 - 0.2;
        for (let j = 0; j < 6; j++) {
          const a = Math.PI * j / 6, b = Math.PI * (j + 1) / 6, cu = (x0 + x1) / 2, cy = ph - r - 0.15;
          sink.quad('stone', facePoint(pf, cu + Math.cos(a) * r, cy + Math.sin(a) * r, 0.2), facePoint(pf, cu + Math.cos(a) * (r + 0.22), cy + Math.sin(a) * (r + 0.22), 0.2),
            facePoint(pf, cu + Math.cos(b) * (r + 0.22), cy + Math.sin(b) * (r + 0.22), 0.2), facePoint(pf, cu + Math.cos(b) * r, cy + Math.sin(b) * r, 0.2), { decor: true });
        }
      }
      faceBox(sink, wall, pf, 0, ph - 0.12, 0.05, 2 * px, 0.3, 0.3, { decor: true });
      const lean: RoofSpec = { kind: 'shed', pitchDeg: 12, eave: 0.35, verge: 0.3, thickness: 0.1, bucket: 'structureMetal' };
      const rd = pz1 - pz0;
      sink.placed(-Math.PI / 2, 0, 0, (pz0 + pz1) / 2, () => emitRoof(sink, roofGeometry(rd, 2 * px, ph + 0.15, lean), { ...lean, decor: true }, LEAD));
    }
    // the pencil minaret at the hall's front corner
    const mx = hs / 2 + 0.15, mz = hz1 - 0.9;
    const shaftTop = clampTo(hh * 2.6, 12, 21.5);
    sink.span('stone', mx - 1.05, -0.4, mz - 1.05, mx + 1.05, hh * 0.7, mz + 1.05);
    sink.cylinder('stone', [mx, hh * 0.7, mz], 'y', 0.9, 1.05, 8, {}, 0.9, true, Math.PI / 8);
    sink.cylinder('stone', [mx, hh * 0.7 + 0.9, mz], 'y', shaftTop - hh * 0.7 - 0.9, 0.86, 12, {}, 0.78, true);
    // the šerefe: the corbelled balcony and its parapet, the upper shaft, the lead cone and its alem
    const sy = shaftTop - 3.4;
    sink.cylinder('stone', [mx, sy - 0.55, mz], 'y', 0.55, 0.8, 12, { decor: true }, 1.25);
    sink.cylinder('stone', [mx, sy, mz], 'y', 0.95, 1.28, 12, { decor: true }, 1.28);
    sink.cylinder('structureMetal', [mx, shaftTop, mz], 'y', clampTo(shaftTop * 0.22, 2.5, 4.6), 0.86, 12, { colour: LEAD, decor: true }, 0.03);
    finial(sink, mx, shaftTop + clampTo(shaftTop * 0.22, 2.5, 4.6) - 0.1, mz, 'alem', 0.7);
    // the harem: a low whitewashed wall round the lot, its gateway on the street; the nišani in rows before the hall
    const t = 0.3, wy = 1.25, zs = D / 2 - t;
    sink.span('plaster', -W / 2, -0.3, zs, -1.2, wy, D / 2);
    sink.span('plaster', 1.2, -0.3, zs, W / 2, wy, D / 2);
    for (const s of [-1, 1]) sink.span('plaster', s * 1.2 - 0.25, -0.3, zs - 0.05, s * 1.2 + 0.25, 2.2, D / 2 + 0.05);
    for (const s of [-1, 1]) {
      sink.span('plaster', s > 0 ? W / 2 - t : -W / 2, -0.3, -D / 2, s > 0 ? W / 2 : -W / 2 + t, wy, zs);
      sink.span('plaster', s > 0 ? hs / 2 : -W / 2 + t, -0.3, -D / 2, s > 0 ? W / 2 - t : -hs / 2, wy, -D / 2 + t);
    }
    const yz0 = Math.max(pz1 + 0.4, hz1 + 0.4), yz1 = zs;
    if (yz1 - yz0 > 1.2) {
      // (a phone keeps four of the stones, every stone drawn)
      const count = 10 + Math.floor(look() * 8);
      for (let k = 0; k < count; k++) {
        const side = look() < 0.5 ? -1 : 1, x = side * (1.8 + look() * Math.max(0.2, W / 2 - 2.6)), z = yz0 + 0.3 + look() * Math.max(0.1, yz1 - yz0 - 0.9);
        const hh = 0.8 + look() * 0.8, turban = look() < 0.6, lean = (look() - 0.5) * 0.4;
        if (!mobile || k < 4) nisan(sink, x, z, hh, turban, lean);
      }
    }
  });
  return sink.finish();
};

// ------------------------------------------------------------------------------------------------ the churches

/** The Serbian Orthodox church: nave under copper, the drum and dome, the apse, the bell tower over the west door. */
const orthodoxChurch: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const f = fillOf(ctx.bounds, 0.1);
  sink.placed(0, f.cx, 0, f.cz, () => {
    const rng = ctx.rng, look = ctx.variant, mobile = ctx.tier === 'mobile';
    const W = clampTo(f.w, 6, 40), D = clampTo(f.d, 9, 40);
    // the nave's eaves on the lot's side edges, the apse on its back edge, the bell tower's front on its street edge
    const nw = clampTo(W - 0.9, 4.6, 40), ar = Math.min(nw * 0.36, 3.4), tw = clampTo(nw * 0.42, 3.0, 4.6);
    const az = -D / 2 + ar, tz1 = D / 2, tz0 = tz1 - tw, nz0 = az, nz1 = tz0 + 0.2;
    const nh = clampTo(nw * 0.95, 6, 8.6);
    const wall: RegionalBucket = rng() < 0.6 ? 'plaster' : 'stone';
    const door = choose(rng(), DOOR_LEAVES);
    const nl = nz1 - nz0;
    const openings: Opening[] = [];
    for (const face of ['left', 'right'] as const) for (const o of windowRhythm(face, 0, nl, { w: 0.85, h: 2.4, sill: 2.0, spacing: 2.6, margin: 1.4 })) openings.push(o);
    const dialect: HouseDialect = {
      window: (s, face, o, y0) => {
        windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { ...STONE_WINDOW, surround: null, bars: 'two' }, look, 0.08);
        archHead(s, face, o.u, y0 + o.y0 + o.h, o.w / 2, 'stone', 0.16, 6);
      },
      door: () => {},
    };
    sink.placed(0, 0, 0, (nz0 + nz1) / 2, () => {
      const frame = buildHouse(sink, {
        w: nw, d: nl, plinth: { h: 0.45, out: 0.06, bucket: 'stone' }, storeys: [{ h: nh, wall }],
        roof: { kind: 'gable', pitchDeg: 32, eave: 0.4, verge: 0.3, thickness: 0.12, bucket: 'structureMetal', ridge: 'saddle' }, roofColour: COPPER,
        gableBucket: wall, openings, chimneys: [], gutters: null, verge: null, reveal: 0.4, rafters: null, spall: 'stone',
      }, dialect);
      const b = frame.bodies[0];
      for (const y of [1.25, nh - 0.9]) sink.band('structureMetal', b.x0 - 0.03, y, b.z0 - 0.03, b.x1 + 0.03, y + 0.28, b.z1 + 0.03, { decor: true, colour: RED_BAND });
      // the drum and the dome over the nave's middle
      const dr = nw * 0.3, dy = frame.roof.ridgeTopY - 0.6;
      sink.cylinder(wall, [0, dy - 1.2, 0], 'y', 3.6, dr, 8, {}, dr, true, Math.PI / 8);
      for (let k = 0; k < 8; k++) {
        const t = (k / 8) * Math.PI * 2;
        const f: Face = { origin: [Math.cos(t) * dr * 0.93, 0, Math.sin(t) * dr * 0.93], u: [Math.sin(t), 0, -Math.cos(t)], out: [Math.cos(t), 0, Math.sin(t)], width: 1 };
        facePanel(sink, 'dark', f, 0, dy + 1.1, 0.04, 0.42, 1.0, { decor: true });
      }
      const t = dome(sink, 0, dy + 2.4, 0, dr * 1.02, COPPER, 12);
      finial(sink, 0, t, 0, 'cross', 0.9);
    });
    // the apse: a half drum at the east end under its half cone
    sink.cylinder(wall, [0, -0.3, az], 'y', nh * 0.82 + 0.3, ar, 8, {}, ar, true, 0, Math.PI);
    sink.cylinder('structureMetal', [0, nh * 0.82, az], 'y', ar * 0.75, ar + 0.3, 8, { colour: COPPER, decor: true }, 0.05, true, 0, Math.PI);
    // the bell tower over the west door
    const th = clampTo(nh * 2.5, 12, 22);
    sink.span(wall, -tw / 2, -0.4, tz0, tw / 2, th, tz1);
    const tf: Face = { origin: [0, 0, tz1], u: [1, 0, 0], out: [0, 0, 1], width: tw };
    doorUnit(sink, tf, 0, 0, 1.3, 2.6, { leaf: door, frame: { bucket: 'stone', width: 0.24, out: 0.08 }, steps: { bucket: 'stone' }, leafKind: 'panel' }, 0.2);
    archHead(sink, tf, 0, 2.84, 0.9, 'stone', 0.22, 6);
    sink.band('structureMetal', -tw / 2 - 0.03, 1.25, tz0 - 0.03, tw / 2 + 0.03, 1.53, tz1 + 0.03, { decor: true, colour: RED_BAND });
    for (const [ox, oz, ux, uz] of [[0, 1, 1, 0], [1, 0, 0, -1], [0, -1, -1, 0], [-1, 0, 0, 1]] as const) {
      const f: Face = { origin: [ox * tw / 2, 0, (tz0 + tz1) / 2 + oz * tw / 2], u: [ux, 0, uz], out: [ox, 0, oz], width: tw };
      facePanel(sink, 'dark', f, 0, th - 2.4, 0.02, tw * 0.36, 1.8, { decor: true });
      archHead(sink, f, 0, th - 1.5, tw * 0.18, 'stone', 0.14, 6);
      faceBox(sink, 'stone', f, 0, th - 0.2, 0.08, tw + 0.2, 0.4, 0.16, { decor: true });
    }
    const top = dome(sink, 0, th, (tz0 + tz1) / 2, tw * 0.48, COPPER, 8);
    finial(sink, 0, top, (tz0 + tz1) / 2, 'cross', 0.8);
    sink.dressing(mobile, () => shellPocks(sink, tf, { u0: -tw / 2 + 0.2, u1: tw / 2 - 0.2, y0: 3.6, y1: th - 3 }, 10 + Math.floor(look() * 12), [], look, 'stone'));
  });
  return sink.finish();
};

/** The Catholic church: a neo-Gothic stone nave with lancets between buttresses, the tower and spire over the door. */
const catholicChurch: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const f = fillOf(ctx.bounds, 0.1);
  sink.placed(0, f.cx, 0, f.cz, () => {
    const rng = ctx.rng, look = ctx.variant, mobile = ctx.tier === 'mobile';
    const W = clampTo(f.w, 6, 40), D = clampTo(f.d, 8, 40);
    const nw = clampTo(W - 1.3, 5, 40), tw = clampTo(nw * 0.42, 3, 4.8);
    const tz1 = D / 2 - 0.3, tz0 = tz1 - tw, nz0 = -D / 2 + 0.3, nz1 = tz0 + 0.3, nl = nz1 - nz0;
    const nh = clampTo(nw * 0.95, 6, 9);
    const door = choose(rng(), DOOR_LEAVES);
    const openings: Opening[] = [];
    for (const face of ['left', 'right'] as const) for (const o of windowRhythm(face, 0, nl, { w: 0.9, h: 3.6, sill: 1.8, spacing: 2.4, margin: 1.2 })) openings.push(o);
    const dialect: HouseDialect = {
      window: (s, face, o, y0) => {
        windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { ...STONE_WINDOW, surround: null, bars: 'two', frame: DARK_FRAME }, look, 0.1);
        archHead(s, face, o.u, y0 + o.y0 + o.h, o.w / 2, 'stone', 0.14, 2);
      },
      door: () => {},
    };
    sink.placed(0, 0, 0, (nz0 + nz1) / 2, () => {
      const frame = buildHouse(sink, {
        w: nw, d: nl, plinth: { h: 0.5, out: 0.06, bucket: 'stone' }, storeys: [{ h: nh, wall: 'stone' }],
        roof: { kind: 'gable', pitchDeg: 52, eave: 0.35, verge: 0.2, thickness: 0.15, bucket: 'roof', ridge: 'saddle' },
        gableBucket: 'stone', openings, chimneys: [], gutters: { colour: ZINC }, verge: null, reveal: 0.42, rafters: null, spall: null,
      }, dialect);
      const b = frame.bodies[0];
      // the buttresses between the lancets, stepped at mid height
      for (const s of [-1, 1]) {
        const x = s > 0 ? b.x1 : b.x0;
        for (let z = b.z0 + 0.3; z <= b.z1 - 0.2; z += 2.4) {
          const zz = Math.min(z, b.z1 - 0.3);
          sink.span('stone', s > 0 ? x : x - 0.55, -0.3, zz - 0.25, s > 0 ? x + 0.55 : x, nh * 0.55, zz + 0.25);
          sink.span('stone', s > 0 ? x : x - 0.35, nh * 0.55, zz - 0.22, s > 0 ? x + 0.35 : x, nh - 0.4, zz + 0.22, { decor: true });
        }
      }
    });
    // the tower and its spire, the pointed portal, the belfry's lancets and the clock
    const th = clampTo(nh * 2.7, 14, 25), tzc = (tz0 + tz1) / 2;
    sink.span('stone', -tw / 2, -0.4, tz0, tw / 2, th, tz1);
    for (const [ox, oz, ux, uz] of [[0, 1, 1, 0], [1, 0, 0, -1], [0, -1, -1, 0], [-1, 0, 0, 1]] as const) {
      const f: Face = { origin: [ox * tw / 2, 0, tzc + oz * tw / 2], u: [ux, 0, uz], out: [ox, 0, oz], width: tw };
      facePanel(sink, 'dark', f, 0, th - 2.6, 0.02, tw * 0.3, 2.4, { decor: true });
      archHead(sink, f, 0, th - 1.4, tw * 0.15, 'stone', 0.12, 2);
      if (oz === 1) {
        sink.polygon('structureWood', Array.from({ length: 10 }, (_, j) => facePoint(f, Math.cos(j / 10 * Math.PI * 2) * 0.6, th - 5.2 + Math.sin(j / 10 * Math.PI * 2) * 0.6, 0.03)),
          { decor: true, colour: rgb(0xd8d2c0) });
      }
      faceBox(sink, 'stone', f, 0, th - 0.15, 0.1, tw + 0.25, 0.3, 0.2, { decor: true });
    }
    const tf: Face = { origin: [0, 0, tz1], u: [1, 0, 0], out: [0, 0, 1], width: tw };
    doorUnit(sink, tf, 0, 0, 1.5, 2.9, { leaf: door, frame: { bucket: 'stone', width: 0.3, out: 0.12 }, steps: { bucket: 'stone' }, leafKind: 'plank' }, 0.2);
    archHead(sink, tf, 0, 3.2, 1.05, 'stone', 0.26, 2);
    const spire = clampTo(th * 0.42, 5, 10);
    sink.cylinder('structureMetal', [0, th, tzc], 'y', spire, tw * 0.62, 8, { colour: rgb(0x4d5357) }, 0.04, true, Math.PI / 8);
    finial(sink, 0, th + spire - 0.1, tzc, 'cross', 0.8);
    sink.dressing(mobile, () => shellPocks(sink, tf, { u0: -tw / 2 + 0.2, u1: tw / 2 - 0.2, y0: 4, y1: th - 3.5 }, 12 + Math.floor(look() * 14), [], look, 'plaster'));
  });
  return sink.finish();
};

// ------------------------------------------------------------------------------------------------ the market hall

/** The market hall: an ochre hall, two tiers of arched windows, the arched entrance under a clock, a ridge lantern. */
const marketHall: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const f = fillOf(ctx.bounds, 0.15);
  sink.placed(0, f.cx, 0, f.cz, () => {
    const rng = ctx.rng, look = ctx.variant, mobile = ctx.tier === 'mobile';
    // the eaves (0.6 m) and the verges (0.35 m) on the lot's fill: the walls stand in by them
    const W = clampTo(f.w - 1.2, 7, 40), D = clampTo(f.d - 0.7, 9, 50);
    const hH = clampTo(W * 0.6, 6, 9.5);
    const door = choose(rng(), DOOR_LEAVES);
    const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'gate', u: 0, w: clampTo(W * 0.28, 2.6, 4.2), y0: 0, h: clampTo(hH * 0.5, 3, 4.6) }];
    for (const face of ['left', 'right'] as const) {
      for (const o of windowRhythm(face, 0, D, { w: 1.5, h: hH * 0.3, sill: 1.0, spacing: 3.4, margin: 1.6 })) openings.push(o);
      for (const o of windowRhythm(face, 0, D, { w: 1.5, h: hH * 0.24, sill: hH * 0.56, spacing: 3.4, margin: 1.6 })) openings.push(o);
    }
    openings.push({ face: 'back', storey: 0, kind: 'door', u: 0, w: 1.4, y0: 0, h: 2.6 });
    const dialect: HouseDialect = {
      window: (s, face, o, y0) => {
        windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { ...STONE_WINDOW, bars: 'six', frame: rgb(0x5a5f5c) }, look, 0.05);
        archHead(s, face, o.u, y0 + o.y0 + o.h + 0.26, o.w / 2 + 0.18, 'stone', 0.18, 6);
      },
      door: (s, face, o, y0, frame) => {
        if (o.kind === 'gate') {
          gateUnit(s, face, o.u, y0 + o.y0, o.w, o.h, door, { bucket: 'stone', width: 0.36, out: 0.14 });
          archHead(s, face, o.u, y0 + o.y0 + o.h + 0.36, o.w / 2 + 0.36, 'stone', 0.32, 8);
          return;
        }
        doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: door, frame: { bucket: 'stone', width: 0.2, out: 0.08 }, steps: { bucket: 'stone' }, leafKind: 'plank' }, frame.floors[o.storey] + o.y0);
      },
    };
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.5, out: 0.06, bucket: 'stone' }, storeys: [{ h: hH, wall: 'plaster2' }],
      roof: { kind: 'gable', pitchDeg: 28, eave: 0.6, verge: 0.35, thickness: 0.16, bucket: 'roof', ridge: 'saddle' }, gableBucket: 'plaster2',
      openings, chimneys: [], gutters: { colour: ZINC }, verge: null, reveal: 0.34, rafters: null, spall: 'stone',
    }, dialect);
    const b = frame.bodies[0], rg = frame.roof;
    sink.band('stone', b.x0 - 0.2, hH - 0.15, b.z0 - 0.2, b.x1 + 0.2, hH + 0.4, b.z1 + 0.2, { decor: true });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      sink.span('stone', sx > 0 ? b.x1 - 0.5 : b.x0 - 0.12, 0, sz > 0 ? b.z1 - 0.5 : b.z0 - 0.12, sx > 0 ? b.x1 + 0.12 : b.x0 + 0.5, hH - 0.15, sz > 0 ? b.z1 + 0.12 : b.z0 + 0.5, { decor: true });
    }
    // the ridge lantern: a louvred clerestory along the ridge under its own roof
    const lw = clampTo(W * 0.22, 1.6, 3.4), ll = D - 3.0;
    sink.span('plaster2', -lw / 2, rg.ridgeY - 1.0, -ll / 2, lw / 2, rg.ridgeY + 1.1, ll / 2);
    for (const s of [-1, 1]) {
      const f: Face = { origin: [s * lw / 2, 0, 0], u: [0, 0, -s], out: [s, 0, 0], width: ll };
      facePanel(sink, 'dark', f, 0, rg.ridgeY + 0.6, 0.02, ll - 0.6, 0.7, { decor: true });
      if (!mobile) for (let y = rg.ridgeY + 0.35; y < rg.ridgeY + 0.95; y += 0.16) faceBox(sink, 'structureWood', f, 0, y, 0.05, ll - 0.6, 0.04, 0.06, { colour: IRON, decor: true, fine: true });
    }
    const cap: RoofSpec = { kind: 'gable', pitchDeg: 26, eave: 0.3, verge: 0.3, thickness: 0.12, bucket: 'roof', ridge: 'saddle' };
    emitRoof(sink, roofGeometry(lw, ll, rg.ridgeY + 1.1, cap), cap);
    // the clock in the front gable
    const ff = frame.faces.front;
    const clockY = hH + (rg.ridgeY - hH) * 0.42;
    sink.polygon('structureWood', Array.from({ length: 12 }, (_, j) => facePoint(ff, Math.cos(j / 12 * Math.PI * 2) * 0.75, clockY + Math.sin(j / 12 * Math.PI * 2) * 0.75, 0.04)), { decor: true, colour: rgb(0xe0dccc) });
    faceBox(sink, 'structureMetal', ff, 0, clockY + 0.2, 0.06, 0.05, 0.5, 0.02, { colour: IRON, decor: true });
    sink.dressing(mobile, () => {
      const side = frame.faces.left;
      for (let k = 0; k < 2; k++) shellHole(sink, side, (look() - 0.5) * D * 0.7, hH * (0.45 + look() * 0.1), 0.4 + look() * 0.3, look, 'stone');
    });
  });
  return sink.finish();
};

// ------------------------------------------------------------------------------------------------ the čaršija row

/**
 * A čaršija row: single-storey timber shops on a stone sill under one deep-eaved tile roof, their fronts to the plot's
 * +x side (the street the row looks onto) and its +z end, the ćepenci closed or let down as counters; over the row's
 * far end a whitewashed han storey oversailing on beam ends.
 */
const carsija: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const f = fillOf(ctx.bounds, 0.1);
  sink.placed(0, f.cx, 0, f.cz, () => {
    const rng = ctx.rng, look = ctx.variant, mobile = ctx.tier === 'mobile';
    // the deep eaves (0.85 m over the shopfronts, 0.55 m at the ends) reach the lot's fill: the walls stand in by them
    const W = clampTo(f.w - 1.7, 3.4, 40), D = clampTo(f.d - 1.1, 6, 40);
    // a double row across the whole lot: shops back to back, their fronts to both long sides
    const sd = W, cx = 0;
    const hanL = clampTo(D * 0.36, 3.5, 8), sL = D - hanL;
    const timber = choose(rng(), TIMBER);
    const sH = 3.1;
    // the shops: the shopfronts along the +x side and the +z end, closed or open as counters
    const shopOpenings: Opening[] = [];
    const n = Math.max(2, Math.floor((sL - 0.6) / 3.2));
    for (let k = 0; k < n; k++) for (const face of ['right', 'left'] as const) {
      shopOpenings.push({ face, storey: 0, kind: 'shopfront', u: -sL / 2 + 0.3 + (sL - 0.6) * (k + 0.5) / n, w: 2.5, y0: 0, h: 2.45 });
    }
    shopOpenings.push({ face: 'front', storey: 0, kind: 'shopfront', u: 0, w: Math.min(2.4, sd - 1.0), y0: 0, h: 2.45 });
    const dialect: HouseDialect = {
      window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { frame: DARK_FRAME, frameWidth: 0.05, frameOut: 0.04, bars: 'six', surround: null, sill: { bucket: 'structureWood', out: 0.08, colour: timber }, shutters: { colour: shade(timber, 1.1), kind: 'plank', closed: 0.3 } }, look, 0.06),
      door: (s, face, o, y0) => {
        const y = y0 + o.y0, r = s.recess, back = r > 0 ? -r : 0;
        const open = look() < 0.25;
        if (!open) {
          // the closed ćepenci: two leaves of boards across the opening
          for (const t of [0.27, 0.73]) faceBox(s, 'structureWood', face, o.u, y + o.h * t, back + 0.05, o.w, o.h * 0.44, 0.05, { colour: shade(timber, 0.95 + look() * 0.15), decor: true });
          return;
        }
        faceBox(s, 'dark', face, o.u, y + o.h / 2, back + 0.01, o.w, o.h, 0.01, { decor: true });
        faceBox(s, 'structureWood', face, o.u, y + 0.82, 0.3, o.w, 0.06, 0.7, { colour: timber, decor: true });
        faceBox(s, 'structureWood', face, o.u, y + o.h + 0.05, 0.4, o.w, 0.06, 0.8, { colour: shade(timber, 1.1), decor: true });
      },
    };
    sink.placed(0, cx, 0, D / 2 - sL / 2, () => {
      buildHouse(sink, {
        w: sd, d: sL, plinth: { h: 0.4, out: 0.04, bucket: 'stone' }, storeys: [{ h: sH, wall: 'plaster' }],
        roof: { kind: 'hip', pitchDeg: 22, eave: 0.85, verge: 0.55, thickness: 0.14, bucket: 'roof', ridge: 'round' }, gableBucket: 'plaster', openings: shopOpenings,
        chimneys: [], gutters: null, verge: null, reveal: 0.12, rafters: mobile ? null : timber, spall: 'stone',
      }, dialect);
      // the posts carrying the deep eaves over the shopfronts
      if (!mobile) for (let k = 0; k <= n; k++) for (const sx of [-1, 1]) {
        const z = -sL / 2 + 0.3 + (sL - 0.6) * k / n;
        sink.member('structureWood', [sx * (sd / 2 + 0.05), sH * 0.55, z], [sx * (sd / 2 + 0.7), sH + 0.2, z], 0.12, 0.12, [0, 0, 1], { colour: timber, decor: true, exposed: true }, 0);
      }
    });
    // the han over the far end: a stone ground storey, the whitewashed storey above on its beam ends
    const hanOpenings: Opening[] = [{ face: 'right', storey: 0, kind: 'door', u: 0, w: 1.6, y0: 0, h: 2.4 }];
    for (const face of ['right', 'left', 'back'] as const) {
      const width = face === 'back' ? sd : hanL;
      for (const o of windowRhythm(face, 1, width, { w: 0.7, h: 1.0, sill: 0.7, spacing: 1.5, margin: 0.6 })) hanOpenings.push(o);
    }
    sink.placed(0, cx, 0, -D / 2 + hanL / 2, () => {
      buildHouse(sink, {
        w: sd, d: hanL, plinth: { h: 0.3, out: 0.04, bucket: 'stone' },
        storeys: [{ h: 3.0, wall: 'stone' }, { h: 2.8, wall: 'plaster' }],
        roof: { kind: 'hip', pitchDeg: 34, eave: 0.55, verge: 0.55, thickness: 0.15, bucket: 'roof', ridge: 'round' }, gableBucket: 'plaster', openings: hanOpenings,
        chimneys: [{ x: 0, z: -hanL * 0.2, sx: 0.5, sz: 0.5, above: 0.7, bucket: 'plaster', cap: 'tile' }],
        gutters: null, verge: null, reveal: 0.24, rafters: mobile ? null : timber, spall: 'stone',
      }, {
        ...dialect,
        door: (s, face, o, y0, frame) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: timber, frame: { bucket: 'stone', width: 0.24, out: 0.08, arch: true }, steps: { bucket: 'stone' }, leafKind: 'plank' }, frame.floors[o.storey] + o.y0),
      });
    });
  });
  return sink.finish();
};

export const SARAJEVO_CIVIC_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  civichall: civicHall,
  firestation: mosque,
  factory: orthodoxChurch,
  foundryoffice: catholicChurch,
  warehouse: marketHall,
  depot: carsija,
});

export type { RegionalParts, Vec3 };
