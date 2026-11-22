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
import { PartSink, faceBox, facePanel, facePoint, normalize3, rgb, shade, type EmitOptions, type Face, type RegionalBucket, type RegionalParts, type Rgb, type Vec3 } from './geometry.ts';
import { domeSegments, polygonalDome, smoothDome } from './domes.ts';
import { buildHouse, emitRoof, holedBox, holedPolygon, recordShaft, roofGeometry, windowRhythm, type HouseDialect, type Opening, type RoofSpec } from './house.ts';
import { doorUnit, gateUnit, windowUnit, type DoorStyle, type WindowStyle } from './openings.ts';
import type { RegionalBuildContext, RegionalBuilder } from './types.ts';
import {
  AH_FRAME, CHAR, COPPER, DARK_FRAME, DOOR_LEAVES, IRON, LEAD, TIMBER, ZINC,
  archGlazing, archHead, choose, clampTo, fillOf, nisan, openBelfry, pediment, shellPocks,
} from './sarajevoParts.ts';

function uvOffset(ctx: RegionalBuildContext): [number, number] {
  return [ctx.rng() * 7.31, ctx.rng() * 5.17];
}

const RED_BAND = rgb(0x9a4632), GILT = rgb(0xb8933e);

const STONE_WINDOW: WindowStyle = {
  frame: AH_FRAME, frameWidth: 0.07, frameOut: 0.05, bars: 'cross',
  surround: { bucket: 'stone', width: 0.18, out: 0.07, lintel: 0.26 }, sill: { bucket: 'stone', out: 0.12 }, shutters: null,
};

/**
 * A dome of sheet metal over (x, y0, z): a hemisphere of radius r, a little stilted, its foot dressed by a drip ring and
 * — on a dome of two metres or more — the standing seams down it, turned smooth (domes.ts; dome-detail-275: it was four
 * stacked rings of twelve flat facets, the largest dome in the game the coarsest). `segments` is a floor (the shell takes
 * at least domes.ts's). Returns the crown's height.
 */
function dome(sink: PartSink, x: number, y0: number, z: number, r: number, colour: Rgb, segments = 12, decor = false, octagonal = false): number {
  const emit = { colour, ...(decor ? { decor: true } : {}) };
  // an octagonal turret's cupola: the polygonal cloister vault over its eight faces (domes.ts polygonalDome)
  if (octagonal) return polygonalDome(sink, 'structureMetal', x, y0, z, r, 8, emit, Math.PI / 8);
  const shell = smoothDome(sink, 'structureMetal', x, y0, z, r, { stilt: 0.08, segments, emit });
  sink.revolve('structureMetal', [x, y0, z], 'y', [[-0.03, r + 0.08], [0.09, r + 0.08], [0.09, r]], domeSegments(r), { colour: shade(colour, 0.85), decor: true });
  if (r >= 2) {
    // the standing seams: a rib from the drip ring to the crown's ring on every second gore
    const ribs = Math.round(r * 2) * 2, rows = 4;
    for (let k = 0; k < ribs; k++) {
      const phi = (k + 0.5) * Math.PI * 2 / ribs;
      for (let i = 0; i < rows; i++) {
        const e0 = (Math.PI / 2) * 0.92 * i / rows, e1 = (Math.PI / 2) * 0.92 * (i + 1) / rows;
        sink.member('structureMetal', shell.surface(e0, phi, 0.015), shell.surface(e1, phi, 0.015), 0.05, 0.05, shell.normal((e0 + e1) / 2, phi),
          { colour: shade(colour, 1.12), decor: true, fine: true }, 0.02);
      }
    }
  }
  return shell.top;
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
    // (props census #9: the corner pavilions stand over the house's ends, its end walls and the long walls' last bays
    // inside them: no windows there, they were cut into the pavilions' cores)
    const inner = (W - 1.2) / 2 - pw, ends: Array<[number, number]> = [[-W, -inner], [inner, W]];
    for (const o of windowRhythm('left', 0, W, { w: 1.5, h: 2.5, sill: 1.1, spacing: 3.6, margin: 2.2, avoid: [[-3.4, 3.4], ...ends] })) openings.push(o);
    for (const o of windowRhythm('left', 1, W, { w: 1.55, h: 3.0, sill: 0.8, spacing: 3.6, margin: 2.2, avoid: [[-3.4, 3.4], ...ends] })) openings.push(o);
    for (const i of [0, 1]) for (const o of windowRhythm('right', i, W, { w: 1.4, h: 2.4, sill: 1.1, spacing: 3.6, margin: 1.6, avoid: ends })) openings.push(o);
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
      // the corner pavilions: a storey taller, under their own hipped roofs; (props census #9) their windows cut through
      // their walls, the units in the reveals (they were laid on a solid span), the walls 3 cm proud of the house's back
      // and end walls (they ran in the house's planes: one face over another)
      const prev = 0.26;
      for (const s of [-1, 1]) {
        const pz0 = s > 0 ? b.z1 - pw : b.z0, pz1 = pz0 + pw, ph = eave + 1.6;
        const ys = [1.4, g0 + 0.9, eave - 0.2], hs = ys.map((y) => (y > eave - 1 ? 1.2 : 2.4));
        // (flush with the back wall: their roofs' eaves stay inside the main roof's)
        const pv = holedBox(sink, 'plaster', b.x0 - 0.7, s < 0 ? pz0 - 0.03 : pz0, b.x1 + 0.03, s > 0 ? pz1 + 0.03 : pz1, 0, ph,
          { left: ys.map((y, k) => ({ u0: -0.7, u1: 0.7, y0: y, y1: y + hs[k] })) }, 0.3, prev);
        sink.band('stone', b.x0 - 0.9, ph - 0.6, pz0 - 0.15, b.x1 + 0.2, ph, pz1 + 0.15, { decor: true });
        const cap: RoofSpec = { kind: 'hip', pitchDeg: 34, eave: 0.4, verge: 0.4, thickness: 0.16, bucket: 'roof', ridge: 'saddle' };
        sink.placed(0, (b.x0 - 0.7 + b.x1) / 2, 0, (pz0 + pz1) / 2, () => emitRoof(sink, roofGeometry(b.x1 - b.x0 + 0.7, pw, ph, { ...cap, verge: 0.4 }), cap));
        sink.recess = prev;
        try { ys.forEach((y, k) => windowUnit(sink, pv.left, 0, y, 1.4, hs[k], STONE_WINDOW, look, 0.05)); } finally { sink.recess = 0; }
      }
      // the entrance pavilion: taller, its pediment, the portal, the drum and the dome behind
      // (props census #9) its portal and windows cut through its walls, the leaf and the units in the reveals (they were
      // laid on a solid span); a pilaster that would stand over the portal is left out (a narrow pavilion's portal is
      // all its front)
      const ex0 = b.x0 - (proj - 0.35), rh = eave + 3.4, dh = Math.min(1.1, rw - 0.35), erev = 0.3;
      const eHoles = [{ u0: -dh, u1: dh, y0: 0, y1: 3.8 }];
      if (rw > 3.2) for (const du of [-0.63, 0.63]) for (const y of [1.6, g0 + 1.0]) eHoles.push({ u0: du * rw - 0.6, u1: du * rw + 0.6, y0: y, y1: y + 2.5 });
      const ef = holedBox(sink, 'plaster', ex0, -rw, b.x0 + dr, rw, 0, rh, { left: eHoles }, 0.36, erev).left;
      for (const du of [-0.9, -0.35, 0.35, 0.9]) {
        if (Math.abs(du * rw) - 0.31 < dh + 0.04) continue;
        faceBox(sink, 'stone', ef, du * rw, rh / 2, 0.12, 0.62, rh - 0.6, 0.24, { decor: true, fineSides: true });
      }
      faceBox(sink, 'stone', ef, 0, rh - 0.35, 0.2, 2 * rw + 0.4, 0.7, 0.4, { decor: true });
      const ped = [[-rw - 0.2, rh], [rw + 0.2, rh], [0, rh + rw * 0.48]] as const;
      sink.prism('stone', ped.map(([u, y]) => facePoint(ef, u, y, 0)), ef.out, 0.35);
      faceBox(sink, 'structureWood', ef, 0, 1.9, -erev + 0.034, 2 * dh, 3.8, 0.06, { colour: door, decor: true });
      archHead(sink, ef, 0, 3.8, dh, 'stone', 0.28);
      sink.recess = erev;
      try {
        if (rw > 3.2) for (const du of [-0.63, 0.63]) for (const y of [1.6, g0 + 1.0]) windowUnit(sink, ef, du * rw, y, 1.2, 2.5, STONE_WINDOW, look, 0.05);
      } finally { sink.recess = 0; }
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
    const openings: Opening[] = [{ face: 'left', storey: 0, kind: 'gate', u: 0, w: 3.0, y0: 0, h: 3.6, arch: {} }];
    for (let i = 0; i < 3; i++) {
      const w = i === 0 ? 1.4 : 1.3, h = i === 0 ? 2.3 : 2.0, sill = i === 0 ? 1.2 : 0.8;
      // (E10) round-headed windows: the house cuts their heads
      for (const face of ['left', 'right'] as const) for (const o of windowRhythm(face, i, W, { w, h, sill, spacing: 3.3, margin: 2.0, avoid: face === 'left' && i === 0 ? [[-2.2, 2.2]] : [] })) openings.push({ ...o, arch: {} });
      for (const face of ['front', 'back'] as const) for (const o of windowRhythm(face, i, D, { w, h, sill, spacing: 3.3, margin: 2.0 })) openings.push({ ...o, arch: {} });
    }
    // the fire: most of the upper storeys' windows gutted
    for (const o of openings) if (o.storey > 0 && o.kind === 'window' && look() < 0.55) o.state = 'burnt';
    const dialect: HouseDialect = {
      window: (s, face, o, y0) => {
        windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { ...STONE_WINDOW, surround: null, bars: 'two' }, look, 0.04);
        if (!o.state) archGlazing(s, face, o.u, y0 + o.y0 + o.h, o.w / 2, STONE_WINDOW.frame);
        archHead(s, face, o.u, y0 + o.y0 + o.h, o.w / 2, 'stone', 0.18, 5);
      },
      door: (s, face, o, y0) => {
        gateUnit(s, face, o.u, y0 + o.y0, o.w, o.h, door, { bucket: 'stone', width: 0.35, out: 0.12 });
        archGlazing(s, face, o.u, y0 + o.y0 + o.h, o.w / 2, shade(door, 0.8));
        archHead(s, face, o.u, y0 + o.y0 + o.h, o.w / 2, 'stone', 0.4, 9);
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
        // (259, the phone census: a square band round the octagon stood off its faces, on them only by its fine top and
        // underside) an octagonal collar on the turret
        sink.cylinder('structureMetal', [x, ph - 0.3, z], 'y', 0.3, tr + 0.06, 8, { decor: true, colour: RED_BAND }, tr + 0.06, true, Math.PI / 8);
        const t = dome(sink, x, ph + 2.1, z, tr, LEAD, 8, true, true);
        finial(sink, x, t, z, 'alem', 0.5);
      }
      // the central hall: its octagonal drum over the roof, the burnt dome's bare ribs, a few panes left
      const hr = clampTo(Math.min(b.x1 - b.x0, b.z1 - b.z0) * 0.26, 2.5, 5.2), hy = eave + 0.35;
      sink.cylinder('plaster2', [0, hy - 0.2, 0], 'y', 3.6, hr, 8, {}, hr, true, Math.PI / 8);
      // (259, the phone census: a square band 0.5-2.2 m off the octagon's faces, at range a square ring in the air) an
      // octagonal collar on the drum
      sink.cylinder('structureMetal', [0, hy + 2.2, 0], 'y', 0.3, hr + 0.06, 8, { decor: true, colour: RED_BAND }, hr + 0.06, true, Math.PI / 8);
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
      // (dome-detail-275) the hall's stone cornice under its roof
      const hb = frame.bodies[0];
      sink.band('stone', hb.x0 - 0.12, frame.eaveY - 0.34, hb.z0 - 0.12, hb.x1 + 0.12, frame.eaveY - 0.06, hb.z1 + 0.12, { decor: true });
      if (domed) {
        const top = frame.eaveY + 0.3;
        // (dome-detail-275) the octagonal drum (it was a plain eight-sided band): its sides slabs round a core, a light cut
        // through each under a round head (the cut's corners filled to the arch) on its sill, a pilaster up each corner,
        // the base course and a stepped cornice, its upper course round under the dome's foot
        const rc = hs * 0.44, p8 = Math.PI / 8, ap = rc * Math.cos(p8), side = 2 * rc * Math.sin(p8), cut = 0.2, dh = 1.5;
        const wr = 0.22, wy = top + 0.35, ws = top + 0.95;
        sink.cylinder(wall, [0, top - 0.05, 0], 'y', dh + 0.05, rc - cut / Math.cos(p8), 8, {}, rc - cut / Math.cos(p8), true, p8);
        for (let k = 0; k < 8; k++) {
          const t = (k / 8) * Math.PI * 2;
          const f: Face = { origin: [Math.cos(t) * ap, 0, Math.sin(t) * ap], u: [Math.sin(t), 0, -Math.cos(t)], out: [Math.cos(t), 0, Math.sin(t)], width: side };
          holedPolygon(sink, wall, f, [[-side / 2, top - 0.05], [side / 2, top - 0.05], [side / 2, top + dh], [-side / 2, top + dh]],
            [{ u0: -wr, u1: wr, y0: wy, y1: ws + wr }], cut, 0.16);
          facePanel(sink, 'glass', f, 0, (wy + ws) / 2, -0.148, 2 * wr, ws - wy, { decor: true, window: f.out });
          lunette(sink, 'glass', f, 0, ws, wr, -0.148, 4, { decor: true });
          spandrels(sink, wall, f, 0, ws, wr, 0.002, { decor: true }, 0, 4);
          archHead(sink, f, 0, ws, wr, 'stone', 0.1, 5);
          faceBox(sink, 'stone', f, 0, wy - 0.05, 0.05, 2 * wr + 0.3, 0.1, 0.1, { decor: true });
          for (const e of [-1, 1]) faceBox(sink, 'stone', f, e * (side / 2 - 0.11), top + dh / 2, 0.035, 0.22, dh - 0.1, 0.07, { decor: true, shade: 1.04 }, { back: true });
        }
        sink.cylinder('stone', [0, top - 0.05, 0], 'y', 0.22, rc + 0.06, 8, { decor: true }, rc + 0.06, true, p8);
        sink.cylinder('stone', [0, top + dh - 0.12, 0], 'y', 0.16, rc + 0.08, 8, { decor: true }, rc + 0.08, true, p8);
        sink.revolve('stone', [0, top + dh + 0.04, 0], 'y', [[0, 0], [0, rc + 0.08], [0.05, rc + 0.2], [0.16, rc + 0.2], [0.16, 0]], domeSegments(rc), { decor: true, shade: 0.95 });
        const t = dome(sink, 0, top + dh + 0.2, 0, hs * 0.42, LEAD, 12);
        finial(sink, 0, t, 0, 'alem', 0.9);
      } else finial(sink, 0, frame.roof.ridgeTopY + 0.05, 0, 'alem', 0.7);
    });
    // the portico before the door: a stone platform, slender columns, arches, a lead-sheeted lean-to roof
    // (dome-detail-275: plain shafts to the roof under a flat ring of quads) the stone sofa with its steps; the columns on
    // square bases under their capitals and abaci; pointed arches of voussoirs, every second stone the red (the ablaq),
    // their spandrels filled to the entablature and its cornice; the iron tie rods between the capitals and back to the hall
    const pz0 = hz1, pz1 = Math.min(D / 2 - 2.2, hz1 + 3.2);
    if (pz1 - pz0 > 1.6) {
      const px = hs / 2 - 0.1, ph = Math.min(hh - 0.4, 4.0), cz = pz1 - 0.3;
      sink.span('stone', -px, -0.3, pz0, px, 0.35, pz1);
      for (let k = 1; k <= 2; k++) sink.span('stone', -1.2, -0.3, pz1 + 0.32 * (k - 1), 1.2, 0.35 - 0.12 * k, pz1 + 0.32 * k, { decor: true, shade: 0.92 });
      const cols = Math.max(3, Math.round(hs / 2.4) + 1), bay = (2 * px - 0.5) / (cols - 1), colX = (k: number) => -px + 0.25 + bay * k;
      const r = bay / 2 - 0.2, c = r * 0.22, rw = 0.2, eb = ph - 0.3;
      const spring = eb - 0.08 - Math.sqrt((r + c + rw) ** 2 - c * c);
      for (let k = 0; k < cols; k++) {
        const x = colX(k);
        sink.span('stone', x - 0.24, 0.35, cz - 0.24, x + 0.24, 0.62, cz + 0.24, { decor: true, shade: 0.94 });
        sink.cylinder('stone', [x, 0.35, cz], 'y', spring - 0.73, 0.17, 10, {}, 0.15);
        sink.cylinder('stone', [x, spring - 0.38, cz], 'y', 0.26, 0.16, 8, { decor: true }, 0.27, true, Math.PI / 8);
        sink.span('stone', x - 0.28, spring - 0.12, cz - 0.28, x + 0.28, spring, cz + 0.28, { decor: true });
      }
      const pf: Face = { origin: [0, 0, cz], u: [1, 0, 0], out: [0, 0, 1], width: 2 * px };
      // a pointed arch's line at radius `rr` from its centres: half `e` (-1 the left), `t` 0 at the springing to 1 at the crown
      const arcAt = (cu: number, e: number, rr: number, t: number): [number, number] => {
        const th = Math.PI - t * (Math.PI - Math.acos(-c / rr));
        return [cu - e * (c + rr * Math.cos(th)), spring + rr * Math.sin(th)];
      };
      const n = 4;
      for (let k = 0; k + 1 < cols; k++) {
        const cu = colX(k) + bay / 2;
        for (const e of [-1, 1]) {
          for (let j = 0; j < n; j++) {
            const [u0, y0] = arcAt(cu, e, r + c + rw / 2, Math.max(0, j / n - 0.04)), [u1, y1] = arcAt(cu, e, r + c + rw / 2, Math.min(1, (j + 1) / n + 0.04));
            sink.member('stone', facePoint(pf, u0, y0, 0), facePoint(pf, u1, y1, 0), rw, 0.46 + (j % 2) * 0.02, pf.out,
              { decor: true, exposed: true, ...((j + (e > 0 ? 1 : 0)) % 2 ? { tint: [1.0, 0.7, 0.6] as Rgb, shade: 0.82 } : { shade: 1.06 }) }, 0.23 + (j % 2) * 0.01);
          }
          // the spandrel over this half, front and back, from the column's axis to the crown
          const ext = Array.from({ length: n + 1 }, (_, j) => arcAt(cu, e, r + c + rw, j / n));
          const corner: [number, number] = [cu + e * bay / 2, eb];
          const ring: Array<[number, number]> = e < 0 ? [corner, ...ext, [cu, eb]] : [corner, [cu, eb], ...[...ext].reverse()];
          sink.polygon(wall, ring.map(([u, y]) => facePoint(pf, u, y, 0.2)), { decor: true, shade: 0.93 });
          sink.polygon(wall, [...ring].reverse().map(([u, y]) => facePoint(pf, u, y, -0.2)), { decor: true, shade: 0.8 });
        }
        sink.member('structureMetal', [colX(k) + 0.28, spring - 0.06, cz], [colX(k + 1) - 0.28, spring - 0.06, cz], 0.035, 0.035, [0, 0, 1], { colour: IRON, decor: true, exposed: true }, 0.0175);
      }
      for (const e of [-1, 1]) {
        sink.span(wall, e * colX(cols - 1), spring, cz - 0.2, e * (px + 0.02), eb, cz + 0.2, { decor: true });
        sink.member('structureMetal', [e * colX(cols - 1), spring - 0.06, cz - 0.28], [e * colX(cols - 1), spring - 0.06, pz0], 0.035, 0.035, [1, 0, 0], { colour: IRON, decor: true, exposed: true }, 0.0175);
      }
      sink.span(wall, -px - 0.02, eb, cz - 0.22, px + 0.02, ph, cz + 0.22, { decor: true });
      sink.span('stone', -px - 0.08, ph - 0.12, cz - 0.24, px + 0.08, ph + 0.02, cz + 0.34, { decor: true, shade: 0.95 });
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
    // (dome-detail-275) the base's cornice, the moulded ring at the shaft's foot
    sink.span('stone', mx - 1.15, hh * 0.7 - 0.2, mz - 1.15, mx + 1.15, hh * 0.7, mz + 1.15, { decor: true, shade: 0.95 });
    sink.cylinder('stone', [mx, hh * 0.7 + 0.9, mz], 'y', 0.18, 0.94, 12, { decor: true }, 0.9, true);
    // the šerefe: the corbelled balcony and its parapet, the upper shaft, the lead cone and its alem
    // (dome-detail-275: a solid drum on a plain cone) the corbelling stepped out in two courses, a ring of stalactite
    // corbels under the balcony's slab, the parapet of carved stone panels between posts under its rail; the upper
    // shaft's cornice under the lead cone
    const sy = shaftTop - 3.4, shaftR = (y: number) => 0.86 - 0.08 * (y - hh * 0.7 - 0.9) / (shaftTop - hh * 0.7 - 0.9);
    sink.cylinder('stone', [mx, sy - 1.05, mz], 'y', 0.3, shaftR(sy - 1.05) + 0.02, 12, { decor: true }, 0.92);
    sink.cylinder('stone', [mx, sy - 0.75, mz], 'y', 0.3, 0.95, 12, { decor: true, shade: 0.93 }, 1.04);
    sink.cylinder('stone', [mx, sy - 0.45, mz], 'y', 0.3, 1.0, 16, { decor: true, shade: 0.7 }, 1.0, false);
    for (let k = 0; k < 16; k++) {
      const a = (k + 0.5) * Math.PI / 8, f: Face = { origin: [mx + Math.cos(a) * 1.0, 0, mz + Math.sin(a) * 1.0], u: [Math.sin(a), 0, -Math.cos(a)], out: [Math.cos(a), 0, Math.sin(a)], width: 0.4 };
      faceBox(sink, 'stone', f, 0, sy - 0.3, 0.1, 0.2, 0.3, 0.2, { decor: true, shade: 0.92 }, { back: true });
    }
    sink.cylinder('stone', [mx, sy - 0.15, mz], 'y', 0.17, 1.32, 16, { decor: true }, 1.32, true);
    const pr = 1.22, pn = 12, pw = 2 * pr * Math.sin(Math.PI / pn);
    for (let k = 0; k < pn; k++) {
      // (the face on the panels' inner line: they stand free, their backs seen from over the gallery)
      const ri = pr * Math.cos(Math.PI / pn) - 0.08;
      const a = (k + 0.5) * Math.PI * 2 / pn, f: Face = { origin: [mx + Math.cos(a) * ri, 0, mz + Math.sin(a) * ri], u: [Math.sin(a), 0, -Math.cos(a)], out: [Math.cos(a), 0, Math.sin(a)], width: pw };
      faceBox(sink, 'stone', f, 0, sy + 0.42, 0.04, pw - 0.1, 0.8, 0.07, { decor: true });
      facePanel(sink, 'stone', f, 0, sy + 0.44, 0.078, pw * 0.5, 0.46, { decor: true, fine: true, shade: 0.6 });
      faceBox(sink, 'stone', f, pw / 2, sy + 0.45, 0.07, 0.11, 0.9, 0.12, { decor: true, shade: 1.04 });
      faceBox(sink, 'stone', f, 0, sy + 0.88, 0.075, pw + 0.02, 0.07, 0.14, { decor: true });
    }
    sink.cylinder('stone', [mx, shaftTop - 0.28, mz], 'y', 0.3, shaftR(shaftTop) + 0.03, 12, { decor: true }, 0.96, true);
    sink.cylinder('structureMetal', [mx, shaftTop, mz], 'y', clampTo(shaftTop * 0.22, 2.5, 4.6), 0.9, 12, { colour: LEAD, decor: true }, 0.03);
    finial(sink, mx, shaftTop + clampTo(shaftTop * 0.22, 2.5, 4.6) - 0.1, mz, 'alem', 0.7);
    // (props census #13, lane B 2026-10-15) the minaret recorded as a tower body of its base's girth: it topples in its
    // courses beside the hall (it went down with the hall)
    recordShaft(sink, mx, mz, 2.1, shaftTop, 'stone');
    // the harem: a low whitewashed wall round the lot, its gateway on the street; the nišani in rows before the hall
    const t = 0.3, wy = 1.25, zs = D / 2 - t;
    // (props census #13, lane B 2026-10-15; the judges: "the harem wall has no coping, the gateway no head") each run
    // of wall under its stone coping, the gateway's piers capped and spanned by a stone lintel under a little lead roof
    const runs: Array<[number, number, number, number]> = [[-W / 2, zs, -1.2, D / 2], [1.2, zs, W / 2, D / 2]];
    for (const s of [-1, 1]) {
      runs.push([s > 0 ? W / 2 - t : -W / 2, -D / 2, s > 0 ? W / 2 : -W / 2 + t, zs]);
      runs.push([s > 0 ? hs / 2 : -W / 2 + t, -D / 2, s > 0 ? W / 2 - t : -hs / 2, -D / 2 + t]);
    }
    for (const [x0, z0, x1, z1] of runs) {
      if (x1 - x0 < 0.05) continue;
      sink.span('plaster', x0, -0.3, z0, x1, wy, z1);
      sink.span('stone', x0 - 0.05, wy, z0 - 0.05, x1 + 0.05, wy + 0.1, z1 + 0.05, { decor: true });
    }
    for (const s of [-1, 1]) {
      sink.span('plaster', s * 1.2 - 0.25, -0.3, zs - 0.05, s * 1.2 + 0.25, 2.2, D / 2 + 0.05);
      sink.span('stone', s * 1.2 - 0.32, 2.2, zs - 0.12, s * 1.2 + 0.32, 2.32, D / 2 + 0.12, { decor: true });
    }
    sink.span('stone', -0.95, 2.32, zs - 0.05, 0.95, 2.56, D / 2 + 0.05);
    const gateRoof: RoofSpec = { kind: 'gable', pitchDeg: 30, eave: 0.25, verge: 0.2, thickness: 0.06, bucket: 'structureMetal', ridge: null, decor: true };
    sink.placed(Math.PI / 2, 0, 0, zs + t / 2, () => emitRoof(sink, roofGeometry(t + 0.24, 3.04, 2.56, gateRoof), gateRoof, LEAD));
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

/**
 * (dome-detail-275) The stone filling a rectangular cut's head to a round arch: the two spandrels between the rectangle's
 * top corners and the semicircle of radius r springing at (u, spring), `o` out of the face, so the cut reads round-headed;
 * with `depth` each stands that far out of `o` (a portal's head, a belfry light's): its face, the arch's soffit and its
 * outer jamb (its top and back abut the work over and behind it), else a face.
 */
function spandrels(sink: PartSink, bucket: RegionalBucket, face: Face, u: number, spring: number, r: number, o: number, opts: EmitOptions,
  depth = 0, n = 5): void {
  for (const e of [-1, 1]) {
    const arc: Vec3[] = [];
    for (let j = 0; j <= n; j++) { const t = (Math.PI / 2) * j / n; arc.push(facePoint(face, u + e * Math.cos(t) * r, spring + Math.sin(t) * r, o)); }
    if (e > 0) arc.reverse();
    const corner = facePoint(face, u + e * r, spring + r, o);
    if (depth <= 0) { sink.polygon(bucket, [corner, ...arc], opts); continue; }
    const fwd = (p: Vec3): Vec3 => [p[0] + face.out[0] * depth, p[1], p[2] + face.out[2] * depth];
    sink.polygon(bucket, [corner, ...arc].map(fwd), opts);
    for (let j = 0; j < n; j++) sink.quad(bucket, arc[j], arc[j + 1], fwd(arc[j + 1]), fwd(arc[j]), opts);
    const jamb = e < 0 ? [arc[0], corner] : [corner, arc[n]];
    sink.quad(bucket, jamb[0], fwd(jamb[0]), fwd(jamb[1]), jamb[1], opts);
  }
}

/** (dome-detail-275) An archivolt of voussoirs standing `depth` proud of a face, the stones' faces a shade apart. */
function voussoirs(sink: PartSink, face: Face, u: number, spring: number, r: number, ringW: number, depth: number, n: number): void {
  const rm = r + ringW / 2, lap = (Math.PI / n) * 0.1;
  const at = (t: number) => facePoint(face, u + Math.cos(t) * rm, spring + Math.sin(t) * rm, 0);
  for (let j = 0; j < n; j++) {
    const a = Math.max(0, Math.PI * j / n - lap), b = Math.min(Math.PI, Math.PI * (j + 1) / n + lap);
    // (every second stone 2 cm prouder: the laps never share a plane)
    sink.member('stone', at(a), at(b), ringW, depth + (j % 2) * 0.02, face.out, { decor: true, exposed: true, shade: j % 2 ? 0.9 : 1 }, 0);
  }
}

/**
 * (dome-detail-275) An arch's ring of `n` voussoir faces 3 cm proud of a face (archHead's faces without its end caps: a
 * frieze's run of small arches, a window's head), springing at (u, y), inner radius r.
 */
function arcRing(sink: PartSink, face: Face, u: number, y: number, r: number, w: number, n: number): void {
  const at = (t: number, rr: number) => facePoint(face, u + Math.cos(t) * rr, y + Math.sin(t) * rr, 0.03);
  for (let j = 0; j < n; j++) {
    const a = Math.PI * j / n, b = Math.PI * (j + 1) / n;
    sink.quad('stone', at(a, r), at(a, r + w), at(b, r + w), at(b, r), { decor: true, shade: j % 2 ? 0.88 : 0.97 });
  }
}

/** (dome-detail-275) A half disc on a face: (u, y) its springing line's centre, `n` segments round. */
function lunette(sink: PartSink, bucket: RegionalBucket, face: Face, u: number, y: number, r: number, o: number, n: number, opts: EmitOptions): void {
  const pts: Vec3[] = [facePoint(face, u, y, o)];
  for (let j = 0; j <= n; j++) { const t = Math.PI * j / n; pts.push(facePoint(face, u + Math.cos(t) * r, y + Math.sin(t) * r, o)); }
  sink.polygon(bucket, pts, opts);
}

/** (dome-detail-275) A disc on a face, `n` sides. */
function disc(sink: PartSink, bucket: RegionalBucket, face: Face, u: number, y: number, r: number, o: number, n: number, opts: EmitOptions): void {
  sink.polygon(bucket, Array.from({ length: n }, (_, j) => facePoint(face, u + Math.cos(j * Math.PI * 2 / n) * r, y + Math.sin(j * Math.PI * 2 / n) * r, o)), opts);
}

/** The icon's paints: the saint's lapis ground, the robe's cinnabar, the face's ochre. */
const ICON_BLUE = rgb(0x2a3f6e), ICON_RED = rgb(0x7a2a22), ICON_FLESH = rgb(0xb88a64);

/**
 * A church's bell tower shaft up to its belfry's sills (`top`), a body of its own (it topples in its courses when the
 * church falls: damage.ts towerBody) on its plinth, its west door cut through its front with the leaf hung at the back
 * of the cut; the belfry stands on its flat top. (Props census #13, lane B 2026-10-15: the shaft was a solid span, the
 * door laid on it, and it fell with the nave.) (dome-detail-275) `lights`: its stages' windows, cut too, `light` their
 * unit.
 */
function towerShaft(sink: PartSink, wall: RegionalBucket, cz: number, tw: number, top: number, door: DoorStyle, dw: number, dh: number, reveal: number,
  lights: readonly Opening[] = [], light: HouseDialect['window'] = () => undefined): void {
  const dialect: HouseDialect = {
    window: light,
    door: (s, face, o, y0) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, door, y0 + o.y0),
  };
  sink.placed(0, 0, 0, cz, () => buildHouse(sink, {
    w: tw, d: tw, plinth: { h: 0.3, out: 0.05, bucket: 'stone' }, storeys: [{ h: top - 0.4, wall }],
    roof: { kind: 'flat', pitchDeg: 0, eave: 0, verge: 0, thickness: 0.1, bucket: 'stone' },
    openings: [{ face: 'front', storey: 0, kind: 'door', u: 0, w: dw, y0: 0, h: dh }, ...lights], chimneys: [], gutters: null, verge: null,
    reveal, rafters: null, spall: null,
  }, dialect));
}

/**
 * The Serbian Orthodox church, in the Serbo-Byzantine manner of Sarajevo's Old and New churches (dome-detail-275: it read
 * plain): the nave's walls banded in pairs of red brick courses between the stone, lesenes parting its bays under an
 * arcaded corbel frieze and the eaves' stepped cornice, round-headed bifora on colonnettes; the drum on its square
 * pedestal through the roof, its arched lights between pilasters under a cornice, the copper dome; the apse with its own
 * lights, lesenes, frieze and cornice; the bell tower over the west portal (its archivolt on piers, the icon in the
 * tympanum, a gabled hood), its string courses, lights and bifora belfry under a cupola; the church on its stepped socle,
 * the paved forecourt behind the churchyard's broken wall, graves by the apse; the shells' pocks and a burnt strike on
 * the copper.
 */
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
    const BAND = { decor: true, colour: RED_BAND } as const;
    // (dome-detail-275) the walls' zones: the courses of red brick under the sills, between the lights
    // and over their heads, the sill and head string courses, the frieze and cornice under the eaves
    // (heights from the ground: the walls stand on the 0.45 m plinth, the openings' sills over its top)
    const fl = 0.45, eave = fl + nh, sill = 2.0, wh = 2.2, ww = 1.2, sillA = fl + sill, headA = sillA + wh + ww / 2 + 0.3;
    const lowBands = [0.9, 1.6], winBands = [sillA + 0.75, sillA + 1.45, sillA + 2.15], upBands: number[] = [];
    for (let y = headA + 0.4; y + 0.23 < eave - 0.95; y += 0.62) upBands.push(y);
    const openings: Opening[] = [];
    for (const face of ['left', 'right'] as const) for (const o of windowRhythm(face, 0, nl, { w: ww, h: wh, sill, spacing: 2.6, margin: 1.4 })) openings.push({ ...o, arch: {} });
    // (dome-detail-275) a bifora in the west wall either side of the tower, over the forecourt
    if (nw / 2 - tw / 2 > 2.4) for (const s of [-1, 1]) openings.push({ face: 'front', storey: 0, kind: 'window', u: s * (tw + nw) / 4, w: ww, y0: sill, h: wh, arch: {} });
    // (dome-detail-275) the bifora: two lights parted by a colonnette, the tympanum over them, the archivolt over that
    // (it was one light under a ring); a burnt window keeps its stone
    const ci = -0.14;
    const frameOf = (s: PartSink, face: Face, o: Opening, y: number) => {
      arcRing(s, face, o.u, y + o.h, o.w / 2, 0.16, 5);
    };
    const dialect: HouseDialect = {
      window: (s, face, o, y0) => {
        const y = y0 + o.y0, R = o.w / 2, spring = y + o.h, rl = (R - 0.07) / 2;
        windowUnit(s, face, o.u, y, o.w, o.h, { ...STONE_WINDOW, surround: null, bars: 'none' }, look, 0.08);
        s.cylinder('stone', facePoint(face, o.u, y, ci), 'y', o.h, 0.065, 6, { decor: true, fine: true }, 0.065, false);
        lunette(s, 'stone', face, o.u, spring, R - 0.01, ci, 5, { decor: true, shade: 0.9 });
        for (const e of [-1, 1]) lunette(s, 'glass', face, o.u + e * (0.07 + rl), spring, rl, ci + 0.006, 3, { decor: true });
        frameOf(s, face, o, y);
      },
      damaged: (s, face, o, y0) => frameOf(s, face, o, y0 + o.y0),
      door: () => {},
    };
    let ridgeTop = nh;
    sink.placed(0, 0, 0, (nz0 + nz1) / 2, () => {
      const frame = buildHouse(sink, {
        w: nw, d: nl, plinth: { h: 0.45, out: 0.06, bucket: 'stone' }, storeys: [{ h: nh, wall }],
        roof: { kind: 'gable', pitchDeg: 32, eave: 0.4, verge: 0.3, thickness: 0.12, bucket: 'structureMetal', ridge: 'saddle' }, roofColour: COPPER,
        gableBucket: wall, openings, chimneys: [], gutters: null, verge: null, reveal: 0.4, rafters: null, spall: 'stone',
      }, dialect);
      const b = frame.bodies[0], fc = frame.faces, rg = frame.roof;
      ridgeTop = rg.ridgeTopY;
      // (dome-detail-275) the banded walls: the brick courses round the body under the sills and over the heads; between
      // the lights they run on in lengths, broken by the windows (on the end walls by the tower and the apse)
      const course = (y: number) => sink.band('structureMetal', b.x0 - 0.03, y + 0.05, b.z0 - 0.03, b.x1 + 0.03, y + 0.18, b.z1 + 0.03, BAND);
      [...lowBands, ...upBands].forEach(course);
      for (const name of ['left', 'right', 'front', 'back'] as const) {
        const face = fc[name], half = face.width / 2;
        const cuts: Array<[number, number]> = openings.filter((o) => o.face === name).map((o): [number, number] => [o.u - o.w / 2 - 0.26, o.u + o.w / 2 + 0.26]);
        if (name === 'front') cuts.push([-tw / 2 - 0.02, tw / 2 + 0.02]);
        if (name === 'back') cuts.push([-ar - 0.02, ar + 0.02]);
        cuts.sort((p, q) => p[0] - q[0]);
        const runs: Array<[number, number]> = [];
        let u = -half - 0.03;
        for (const [a, c] of cuts) { if (a - u > 0.2) runs.push([u, a]); u = Math.max(u, c); }
        if (half + 0.03 - u > 0.2) runs.push([u, half + 0.03]);
        for (const [a, c] of runs) for (const y of winBands) facePanel(sink, 'structureMetal', face, (a + c) / 2, y + 0.115, 0.02, c - a, 0.13, BAND);
      }
      // the sill and head string courses
      sink.band('stone', b.x0 - 0.08, sillA - 0.08, b.z0 - 0.08, b.x1 + 0.08, sillA + 0.02, b.z1 + 0.08, { decor: true });
      if (headA + 0.14 < eave - 0.9) sink.band('stone', b.x0 - 0.06, headA, b.z0 - 0.06, b.x1 + 0.06, headA + 0.12, b.z1 + 0.06, { decor: true });
      // the lesenes parting the bays (and doubled at the corners) up to the frieze, the arcaded corbel frieze between them
      // (each arch on the wall, the joints its feet) and the eaves' cornice of two stepped courses over it
      const fTop = eave - 0.36, lH = fTop - fl;
      const lesene = (face: Face, u: number, w: number) => faceBox(sink, wall, face, u, fl + lH / 2, 0.035, w, lH, 0.07, { decor: true, shade: 1.05, fineSides: true }, { back: true, top: true, bottom: true });
      for (const name of ['left', 'right', 'front', 'back'] as const) {
        const face = fc[name], half = face.width / 2;
        for (const e of [-1, 1]) lesene(face, e * (half - 0.25), 0.5);
        if (name !== 'left' && name !== 'right') continue;
        const us = openings.filter((o) => o.face === name).map((o) => o.u).sort((p, q) => p - q);
        const mids = us.slice(1).map((v, i) => (v + us[i]) / 2);
        for (const m of mids) lesene(face, m, 0.42);
        const edges: Array<[number, number]> = [];
        const stops = [-half + 0.5, ...mids.flatMap((m) => [m - 0.21, m + 0.21]), half - 0.5];
        for (let i = 0; i + 1 < stops.length; i += 2) edges.push([stops[i], stops[i + 1]]);
        for (const [a, c] of edges) {
          const n = Math.max(1, Math.round((c - a) / 1.0)), pitch = (c - a) / n, r = pitch / 2 - 0.05, spring = fTop - r - 0.08;
          for (let i = 0; i < n; i++) arcRing(sink, face, a + pitch * (i + 0.5), spring, r, 0.08, 3);
        }
      }
      sink.band('stone', b.x0 - 0.1, eave - 0.36, b.z0 - 0.1, b.x1 + 0.1, eave - 0.2, b.z1 + 0.1, { decor: true });
      sink.band('stone', b.x0 - 0.2, eave - 0.2, b.z0 - 0.2, b.x1 + 0.2, eave - 0.02, b.z1 + 0.2, { decor: true, shade: 0.94 });
      // the raking cornice up each gable under the verge; the oculus in the east gable over the apse, its glass in a ring
      if (rg.gable) for (const name of ['front', 'back'] as const) for (const e of [-1, 1]) {
        const face = fc[name], yAt = (x: number) => rg.ridgeY - x * rg.tanP - 0.13;
        sink.member('stone', facePoint(face, e * (rg.s + 0.05), yAt(rg.s + 0.05), 0), facePoint(face, 0, yAt(0), 0), 0.24, 0.14, face.out, { decor: true }, 0.02);
      }
      const gy = eave + (rg.ridgeY - eave) * 0.5, orr = Math.min(0.5, (rg.ridgeY - eave) * 0.12);
      if (rg.gable && gy - orr - 0.3 > nh * 0.82 + ar * 0.75) {
        const back = fc.back, at = (r: number, j: number) => facePoint(back, Math.cos(j * Math.PI / 6) * r, gy + Math.sin(j * Math.PI / 6) * r, 0.04);
        disc(sink, 'glass', back, 0, gy, orr, 0.01, 12, { decor: true, window: back.out });
        for (let j = 0; j < 12; j++) sink.quad('stone', at(orr, j), at(orr + 0.18, j), at(orr + 0.18, j + 1), at(orr, j + 1), { decor: true, shade: j % 2 ? 0.9 : 1 });
      }
      // the drum and the dome over the nave's middle
      // the drum: its eight lights cut through its sides into the dark under the dome, the glass at the back of each
      // reveal (were dark plates laid on a solid drum); the sides holed slabs round a core
      const dr = nw * 0.3, dy = rg.ridgeTopY - 0.6, ap = dr * Math.cos(Math.PI / 8), side = 2 * dr * Math.sin(Math.PI / 8), cut = 0.22;
      // (dome-detail-275) the drum's square pedestal standing through the roof's slopes (the drum's sides hung in the air
      // over them), the copper flashed up its sides from the roof to the drum's foot
      const pb = ap + 0.12, py = dy - 1.2;
      sink.span(wall, -pb, eave - 0.4, -pb, pb, py - 0.4, pb);
      sink.cylinder('structureMetal', [0, py - 0.4, 0], 'y', 0.42, pb * Math.SQRT2, 4, { colour: shade(COPPER, 0.92), decor: true }, (ap + 0.02) * Math.SQRT2, true, Math.PI / 4);
      sink.cylinder(wall, [0, py, 0], 'y', 3.6, dr - cut / Math.cos(Math.PI / 8), 8, {}, dr - cut / Math.cos(Math.PI / 8), true, Math.PI / 8);
      // (dome-detail-275) each light round-headed (its cut's corners filled to the arch) under its archivolt, on a sill; a
      // pilaster up each corner; the base course, a brick course, the cornice
      const wr = clampTo(side * 0.1, 0.22, 0.34), wy = dy + 0.2, ws = dy + 1.35;
      for (let k = 0; k < 8; k++) {
        const t = (k / 8) * Math.PI * 2;
        const f: Face = { origin: [Math.cos(t) * ap, 0, Math.sin(t) * ap], u: [Math.sin(t), 0, -Math.cos(t)], out: [Math.cos(t), 0, Math.sin(t)], width: side };
        holedPolygon(sink, wall, f, [[-side / 2, py], [side / 2, py], [side / 2, dy + 2.4], [-side / 2, dy + 2.4]],
          [{ u0: -wr, u1: wr, y0: wy, y1: ws + wr }], cut, 0.18);
        facePanel(sink, 'glass', f, 0, (wy + ws) / 2, -0.168, 2 * wr, ws - wy, { decor: true, window: f.out });
        lunette(sink, 'glass', f, 0, ws, wr, -0.168, 5, { decor: true });
        spandrels(sink, wall, f, 0, ws, wr, 0.002, { decor: true });
        arcRing(sink, f, 0, ws, wr, 0.12, 5);
        faceBox(sink, 'stone', f, 0, wy - 0.05, 0.06, 2 * wr + 0.36, 0.1, 0.12, { decor: true });
        for (const e of [-1, 1]) {
          facePanel(sink, 'stone', f, e * (side / 2 - 0.1), (py + 0.25 + dy + 2.0) / 2, 0.03, 0.2, dy + 2.0 - py - 0.25, { decor: true, shade: 1.04 });
        }
      }
      sink.cylinder('stone', [0, py, 0], 'y', 0.25, dr + 0.06, 8, { decor: true }, dr + 0.06, true, Math.PI / 8);
      sink.cylinder('structureMetal', [0, dy - 0.55, 0], 'y', 0.2, dr + 0.03, 8, BAND, dr + 0.03, false, Math.PI / 8);
      sink.cylinder('stone', [0, dy + 2.0, 0], 'y', 0.2, dr + 0.1, 8, { decor: true }, dr + 0.1, true, Math.PI / 8);
      sink.revolve('stone', [0, dy + 2.2, 0], 'y', [[0, 0], [0, dr + 0.24], [0.2, dr + 0.24], [0.2, 0]], 24, { decor: true, shade: 0.96 });
      const t = dome(sink, 0, dy + 2.4, 0, dr * 1.02, COPPER, 12);
      finial(sink, 0, t, 0, 'cross', 0.9);
      // (dome-detail-275) a shell's strike on the copper: the sheets burnt black round the torn hole, four peeled back
      if (rg.s > 3.4) {
        const sx = look() < 0.5 ? -1 : 1, sz = look() < 0.5 ? -1 : 1;
        const hx = sx * Math.min(rg.s - 1.6, 2.4 + look() * 1.6), hz = sz * (pb + 1.3 + look() * Math.max(0.1, nl / 2 - pb - 2.8));
        const rough = Array.from({ length: 9 }, () => 0.7 + look() * 0.3);
        const onRoof = (x: number, z: number, lift: number): Vec3 => [x, (rg.topAt(x, z) ?? rg.eaveY) + lift, z];
        const blot = (r: number, lift: number, bucket: RegionalBucket, opts: EmitOptions) => sink.polygon(bucket, [onRoof(hx, hz, lift),
          ...Array.from({ length: 10 }, (_, j) => { const a = -(j % 9) / 9 * Math.PI * 2, rr = r * rough[j % 9]; return onRoof(hx + Math.cos(a) * rr, hz + Math.sin(a) * rr, lift); })], opts);
        blot(1.25, 0.03, 'structureMetal', { colour: rgb(0x2b2622), decor: true });
        blot(0.5, 0.05, 'dark', { decor: true });
        const nrm = normalize3([sx * rg.tanP, 1, 0]);
        for (let j = 0; j < 4; j++) {
          const a = (j / 4) * Math.PI * 2 + look() * 0.8, p = onRoof(hx + Math.cos(a) * 0.5, hz + Math.sin(a) * 0.5, 0.05), lift = 0.25 + look() * 0.3;
          const q: Vec3 = [p[0] + Math.cos(a) * 0.55 + nrm[0] * lift, p[1] + nrm[1] * lift, p[2] + Math.sin(a) * 0.55];
          sink.member('structureMetal', p, q, 0.42, 0.02, nrm, { colour: shade(COPPER, 0.62), decor: true, exposed: true }, 0);
        }
      }
      // (dome-detail-275) the splinters' pocks down both flanks, clear of the windows
      sink.dressing(mobile, () => {
        for (const name of ['left', 'right'] as const) shellPocks(sink, fc[name], { u0: -nl / 2 + 0.6, u1: nl / 2 - 0.6, y0: 0.6, y1: eave - 1.0 }, 5 + Math.floor(look() * 6),
          openings.filter((o) => o.face === name).map((o) => ({ u0: o.u - o.w / 2 - 0.3, u1: o.u + o.w / 2 + 0.3, y0: fl + o.y0 - 0.1, y1: fl + o.y0 + o.h + o.w / 2 + 0.25 })), look, 'stone');
      });
    });
    // the apse: a half drum at the east end under its half cone
    // (dome-detail-275: eight flat panels, then sixteen) seventeen sides, slabs round a core, three lights cut through
    // them under round heads, lesenes, the brick courses, an arch of the frieze on each side and the cornice
    const AS = 17, ah = nh * 0.82, acut = 0.2, aside = 2 * ar * Math.sin(Math.PI / (2 * AS)), aap = ar * Math.cos(Math.PI / (2 * AS));
    sink.cylinder(wall, [0, -0.3, az], 'y', ah + 0.3, ar - acut / Math.cos(Math.PI / (2 * AS)), AS, {}, ar - acut / Math.cos(Math.PI / (2 * AS)), true, 0, Math.PI);
    const aFace = (i: number): Face => {
      const a = -(i + 0.5) * Math.PI / AS, out: Vec3 = [Math.cos(a), 0, Math.sin(a)];
      return { origin: [out[0] * aap, 0, az + out[2] * aap], u: [out[2], 0, -out[0]], out, width: aside };
    };
    const aRing = (bucket: RegionalBucket, y: number, h: number, r: number, opts: EmitOptions, caps: boolean, i0 = 0, n = AS) =>
      sink.cylinder(bucket, [0, y, az], 'y', h, r, n, opts, r, caps, i0 * Math.PI / AS, n * Math.PI / AS);
    const lights = new Set([4, 8, 12]), strips = new Set([2, 6, 10, 14]);
    const awr = Math.min(0.22, aside / 2 - 0.09), aws = sillA + 1.85, fr = aside / 2 - 0.06, fs = ah - 0.4 - fr - 0.06;
    for (let i = 0; i < AS; i++) {
      const af = aFace(i), lit = lights.has(i);
      holedPolygon(sink, wall, af, [[-aside / 2, -0.3], [aside / 2, -0.3], [aside / 2, ah], [-aside / 2, ah]], lit ? [{ u0: -awr, u1: awr, y0: sillA + 0.05, y1: aws + awr }] : [], acut, 0.16);
      if (lit) {
        facePanel(sink, 'glass', af, 0, (sillA + 0.05 + aws) / 2, -0.148, 2 * awr, aws - sillA - 0.05, { decor: true, window: af.out });
        lunette(sink, 'glass', af, 0, aws, awr, -0.148, 4, { decor: true });
        spandrels(sink, wall, af, 0, aws, awr, 0.002, { decor: true }, 0, 4);
        arcRing(sink, af, 0, aws, awr, 0.1, 4);
      }
      if (strips.has(i)) faceBox(sink, wall, af, 0, (fl + fs) / 2, 0.03, 0.3, fs - fl, 0.06, { decor: true, shade: 1.05, fineSides: true }, { back: true });
      arcRing(sink, af, 0, fs, fr, 0.06, 3);
    }
    aRing('stone', -0.3, 0.75, ar + 0.07, { decor: true }, true);
    aRing('stone', sillA - 0.08, 0.1, ar + 0.08, { decor: true }, false);
    for (const y of [...lowBands, ...upBands]) if (y + 0.23 < fs - 0.1) aRing('structureMetal', y + 0.05, 0.13, ar + 0.03, BAND, false);
    aRing('stone', ah - 0.3, 0.3, ar + 0.16, { decor: true, shade: 0.94 }, true);
    sink.cylinder('structureMetal', [0, ah, az], 'y', ar * 0.75, ar + 0.3, 16, { colour: COPPER, decor: true }, 0.05, true, 0, Math.PI);
    // the bell tower over the west door
    const th = clampTo(nh * 2.5, 12, 22), tzc = (tz0 + tz1) / 2, bsill = th - 3.3, tmid = (eave + bsill) / 2;
    // (dome-detail-275) its stages' round-headed lights (it was blind to the belfry)
    const tLights: Opening[] = [];
    for (const face of ['left', 'right'] as const) {
      tLights.push({ face, storey: 0, kind: 'window', u: 0, w: 0.5, y0: eave + 0.05, h: 1.2, arch: {} });
      tLights.push({ face, storey: 0, kind: 'window', u: 0, w: 0.55, y0: tmid + 0.05, h: 1.4, arch: {} });
    }
    const lightUnit: HouseDialect['window'] = (s, face, o, y0) => {
      windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { ...STONE_WINDOW, surround: null, bars: 'none' }, look, 0.05);
      archGlazing(s, face, o.u, y0 + o.y0 + o.h, o.w / 2, STONE_WINDOW.frame);
      archHead(s, face, o.u, y0 + o.y0 + o.h, o.w / 2, 'stone', 0.12, 5);
    };
    // (props census #13, lane B 2026-10-14) the shaft to the belfry's sills (towerShaft), the belfry open through its
    // arches over it
    const tf: Face = { origin: [0, 0, tz1], u: [1, 0, 0], out: [0, 0, 1], width: tw };
    towerShaft(sink, wall, tzc, tw, bsill, { leaf: door, frame: { bucket: 'stone', width: 0.24, out: 0.08 }, steps: { bucket: 'stone' }, leafKind: 'panel' }, 1.3, 2.6, 0.4, tLights, lightUnit);
    const bow = tw * 0.36;
    openBelfry(sink, wall, 0, tzc, tw, bsill, th - 1.5, th, bow, COPPER, rgb(0x3a2e24));
    archHead(sink, tf, 0, 2.94, 0.9, 'stone', 0.22, 6);
    for (const [ox, oz, ux, uz] of [[0, 1, 1, 0], [1, 0, 0, -1], [0, -1, -1, 0], [-1, 0, 0, 1]] as const) {
      const f: Face = { origin: [ox * tw / 2, 0, tzc + oz * tw / 2], u: [ux, 0, uz], out: [ox, 0, oz], width: tw };
      // the red band round the shaft, broken at the west door's frame (it ran across the cut)
      const band = { decor: true, colour: RED_BAND } as const, reach = tw / 2 + 0.03, gap = 0.65 + 0.24;
      if (oz === 1) for (const sd of [-1, 1]) faceBox(sink, 'structureMetal', f, sd * (reach + gap) / 2, 1.39, 0, reach - gap, 0.28, 0.06, band);
      else faceBox(sink, 'structureMetal', f, 0, 1.39, 0, 2 * reach, 0.28, 0.06, band);
      archHead(sink, f, 0, th - 1.5, tw * 0.18, 'stone', 0.14, 6);
      faceBox(sink, 'stone', f, 0, th - 0.2, 0.08, tw + 0.2, 0.4, 0.16, { decor: true });
      // (dome-detail-275) the corner lesenes up the shaft (on its east face over the nave's ridge), the string courses at
      // the nave's eaves and between the stages, the belfry's sill cornice; in each belfry opening a colonnette parting
      // two round-headed lights, their heads solid under the relieving arch
      const l0 = oz === -1 ? ridgeTop : 0.3;
      for (const e of [-1, 1]) faceBox(sink, wall, f, e * (tw / 2 - 0.2), (l0 + bsill - 0.24) / 2, 0.03, 0.4, bsill - 0.24 - l0, 0.06, { decor: true, shade: 1.05, fineSides: true }, { back: true });
      for (const y of oz === -1 ? [tmid] : [eave, tmid]) faceBox(sink, 'stone', f, 0, y - 0.1, 0.05, tw + 0.12, 0.2, 0.1, { decor: true });
      faceBox(sink, 'stone', f, 0, bsill - 0.12, 0.09, tw + 0.24, 0.24, 0.18, { decor: true, shade: 0.95 });
      const hb = th - 1.5, lr = (bow - 0.14) / 4, ls = hb - lr;
      sink.cylinder('stone', facePoint(f, 0, bsill + 0.12, -0.06), 'y', ls - bsill - 0.24, 0.07, 6, { decor: true }, 0.07, false);
      faceBox(sink, 'stone', f, 0, bsill + 0.06, -0.06, 0.22, 0.12, 0.2, { decor: true });
      faceBox(sink, 'stone', f, 0, ls - 0.06, -0.06, 0.26, 0.12, 0.22, { decor: true });
      faceBox(sink, wall, f, 0, (ls + hb) / 2, -0.06, 0.14, hb - ls, 0.12, { decor: true });
      for (const e of [-1, 1]) spandrels(sink, wall, f, e * (0.07 + lr), ls, lr, -0.12, { decor: true }, 0.12, 3);
    }
    // (dome-detail-275) the cupola on a low round drum and its cornice (it sat straight on the belfry's head)
    const cr = tw * 0.4;
    sink.revolve(wall, [0, th, tzc], 'y', [[0, cr], [0.8, cr], [0.96, cr + 0.14], [0.96, 0]], 24, {});
    const top = dome(sink, 0, th + 0.96, tzc, cr, COPPER, 8);
    finial(sink, 0, top, tzc, 'cross', 0.8);
    // (dome-detail-275) the west portal: piers standing proud either side of the door on their bases under imposts, the
    // archivolt of voussoirs on them, the solid spandrels to a cornice under a gabled hood; the lintel, and in the
    // tympanum the icon of the patron saint on its lapis ground in a gilt frame
    const po = 0.3, pr = 1.45, pwid = 0.5, ps = 2.94, pTop = ps + pr + pwid / 2;
    for (const e of [-1, 1]) {
      faceBox(sink, 'stone', tf, e * pr, (ps - 0.16) / 2, po / 2, pwid, ps - 0.16, po, { decor: true }, { back: true });
      faceBox(sink, 'stone', tf, e * pr, 0.12, (po + 0.08) / 2, pwid + 0.12, 0.24, po + 0.08, { decor: true, shade: 0.92 }, { back: true });
      faceBox(sink, 'stone', tf, e * pr, ps - 0.08, (po + 0.08) / 2, pwid + 0.14, 0.16, po + 0.08, { decor: true, shade: 0.95 }, { back: true });
    }
    voussoirs(sink, tf, 0, ps, pr - pwid / 2, pwid, po, 7);
    spandrels(sink, 'stone', tf, 0, ps, pr + pwid / 2, 0, { decor: true, shade: 0.97 }, po, 5);
    faceBox(sink, 'stone', tf, 0, pTop + 0.1, (po + 0.12) / 2, 2 * (pr + pwid / 2) + 0.3, 0.2, po + 0.12, { decor: true }, { back: true });
    const gb = pr + pwid / 2 + 0.1;
    sink.prism('stone', ([[-gb, pTop + 0.2], [gb, pTop + 0.2], [0, pTop + 0.2 + gb * 0.42]] as const).map(([u, y]) => facePoint(tf, u, y, 0)), tf.out, po + 0.06, { decor: true });
    faceBox(sink, 'stone', tf, 0, 2.77, 0.04, 1.9, 0.34, 0.08, { decor: true });
    lunette(sink, 'stone', tf, 0, ps, 0.9, 0.012, 10, { decor: true, shade: 0.9 });
    lunette(sink, 'structureMetal', tf, 0, ps, 0.8, 0.018, 10, { decor: true, colour: GILT });
    lunette(sink, 'structureWood', tf, 0, ps, 0.7, 0.024, 10, { decor: true, colour: ICON_BLUE });
    sink.polygon('structureWood', ([[-0.32, 0.03], [0.32, 0.03], [0.2, 0.4], [-0.2, 0.4]] as const).map(([u, y]) => facePoint(tf, u, ps + y, 0.03)), { decor: true, fine: true, colour: ICON_RED });
    disc(sink, 'structureMetal', tf, 0, ps + 0.52, 0.14, 0.03, 10, { decor: true, fine: true, colour: GILT });
    disc(sink, 'structureWood', tf, 0, ps + 0.5, 0.075, 0.036, 8, { decor: true, fine: true, colour: ICON_FLESH });
    // (dome-detail-275) the church set into its ground: a stone step round its socle; the forecourt either side of the
    // tower paved, behind the churchyard's low wall on the street, broken by a shell at its inner end
    // and its stones fallen; a grave under its cross either side of the apse
    const step = { decor: true, shade: 0.9 } as const;
    for (const s of [-1, 1]) {
      sink.span('stone', s * nw / 2, -0.3, nz0, s * (nw / 2 + 0.34), 0.16, nz1 + 0.3, step);
      sink.span('stone', s * (tw / 2 - 0.02), -0.3, nz1 + 0.3, s * nw / 2, 0.16, nz1, step);
      sink.span('stone', s * ar, -0.3, nz0 - 0.3, s * (nw / 2 + 0.34), 0.16, nz0, step);
      sink.span('stone', s * tw / 2, -0.3, tz0, s * (tw / 2 + 0.28), 0.16, tz1, step);
    }
    aRing('stone', -0.3, 0.46, ar + 0.34, step, true);
    const yard0 = tw / 2 + 0.28, yard1 = W / 2 - 0.02, wz0 = D / 2 - 0.42;
    for (const s of [-1, 1]) {
      sink.span('stone', s * yard0, -0.2, nz1 + 0.3, s * yard1, 0.03, wz0, { decor: true, shade: 0.8 });
      const xe = Math.max(yard0 + 0.6, W / 2 - (2.0 + look() * 1.4));
      if (W / 2 - xe > 1.4) {
        const xw = s * (xe + 0.85);
        sink.span('stone', xw, -0.3, wz0, s * W / 2, 1.0, D / 2 - 0.02);
        sink.span('stone', xw - s * 0.05, 1.0, wz0 - 0.05, s * (W / 2 + 0.03), 1.1, D / 2 + 0.03, { decor: true, shade: 0.92 });
        sink.span('stone', s * (xe + 0.35), -0.3, wz0, xw, 0.65, D / 2 - 0.02);
        sink.span('stone', s * xe, -0.3, wz0 + 0.04, s * (xe + 0.35), 0.3, D / 2 - 0.06);
        for (let k = 0; k < 2; k++) {
          const x = s * (xe - 0.2 - look() * 0.9), z = wz0 - 0.2 - look() * 0.6, a = look() * 0.4, hb = 0.12 + look() * 0.1;
          sink.placed(look() * Math.PI, x, 0, z, () => sink.span('stone', -0.22 - a * 0.3, -0.05, -0.14, 0.22 + a * 0.3, hb, 0.14, { decor: true, shade: 0.85 }));
        }
      }
      const gx0 = ar + 0.7, gx1 = W / 2 - 0.5, gz0 = -D / 2 + 0.5, gz1 = az - 0.6;
      if (gx1 - gx0 > 1.2 && gz1 - gz0 > 1.4) for (let k = 0; k < 1; k++) {
        const x = s * (gx0 + (gx1 - gx0) * (k + 0.3 + look() * 0.4) / 2), z = gz0 + 0.9 + look() * (gz1 - gz0 - 1.4), yaw = (look() - 0.5) * 0.08;
        sink.span('stone', x - 0.35, -0.2, z - 0.9, x + 0.35, 0.18, z + 0.4, { decor: true, shade: 0.88 });
        sink.placed(yaw, x, 0, z + 0.4, () => {
          sink.span('stone', -0.07, 0.1, -0.06, 0.07, 1.25, 0.06, { decor: true });
          sink.span('stone', -0.32, 0.85, -0.055, 0.32, 0.98, 0.055, { decor: true });
        });
      }
    }
    sink.dressing(mobile, () => shellPocks(sink, tf, { u0: -tw / 2 + 0.2, u1: tw / 2 - 0.2, y0: 3.6, y1: th - 3 }, 7 + Math.floor(look() * 8),
      [{ u0: -gb - 0.1, u1: gb + 0.1, y0: 0, y1: pTop + 0.3 + gb * 0.42 }, ...tLights.filter((o) => o.face === 'front').map((o) => ({ u0: o.u - o.w / 2 - 0.25, u1: o.u + o.w / 2 + 0.25, y0: o.y0, y1: o.y0 + 0.3 + o.h + o.w / 2 + 0.2 }))], look, 'stone'));
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
    // (props census #13, lane B 2026-10-15; the judges: "the east end is a blank gable wall") the tall east window over
    // the altar, cut through the east wall under its pointed head, its glass in four lights
    openings.push({ face: 'back', storey: 0, kind: 'window', u: 0, w: Math.min(1.8, nw * 0.24), y0: 1.6, h: Math.min(nh - 2.6, 5.0) });
    const dialect: HouseDialect = {
      window: (s, face, o, y0) => {
        windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { ...STONE_WINDOW, surround: null, bars: o.w > 1.2 ? 'cross' : 'two', frame: DARK_FRAME }, look, 0.1);
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
    // (props census #13, lane B 2026-10-14) the shaft to the lancets' sills (towerShaft), the belfry open through them
    towerShaft(sink, 'stone', tzc, tw, th - 3.8, { leaf: door, frame: { bucket: 'stone', width: 0.3, out: 0.12 }, steps: { bucket: 'stone' }, leafKind: 'plank' }, 1.5, 2.9, 0.45);
    openBelfry(sink, 'stone', 0, tzc, tw, th - 3.8, th - 1.4, th, tw * 0.3, COPPER, rgb(0x3a2e24));
    for (const [ox, oz, ux, uz] of [[0, 1, 1, 0], [1, 0, 0, -1], [0, -1, -1, 0], [-1, 0, 0, 1]] as const) {
      const f: Face = { origin: [ox * tw / 2, 0, tzc + oz * tw / 2], u: [ux, 0, uz], out: [ox, 0, oz], width: tw };
      archHead(sink, f, 0, th - 1.4, tw * 0.15, 'stone', 0.12, 2);
      if (oz === 1) {
        // the clock: its dial in a stone ring, the twelve hour marks, the hands and the boss (the judges: "the tower's
        // clock is a painted 10-gon cream plate")
        const cy = th - 5.2, at = (r: number, a: number, o: number): Vec3 => facePoint(f, Math.cos(a) * r, cy + Math.sin(a) * r, o);
        sink.polygon('structureWood', Array.from({ length: 12 }, (_, j) => at(0.6, j / 12 * Math.PI * 2, 0.03)), { decor: true, colour: rgb(0xd8d2c0) });
        for (let j = 0; j < 12; j++) {
          const a0 = j / 12 * Math.PI * 2, a1 = (j + 1) / 12 * Math.PI * 2;
          sink.quad('stone', at(0.6, a0, 0.1), at(0.76, a0, 0.1), at(0.76, a1, 0.1), at(0.6, a1, 0.1), { decor: true });
          sink.quad('stone', at(0.6, a1, 0.1), at(0.6, a1, 0.0), at(0.6, a0, 0.0), at(0.6, a0, 0.1), { decor: true, shade: 0.7 });
          sink.quad('stone', at(0.76, a0, 0.1), at(0.76, a0, 0.0), at(0.76, a1, 0.0), at(0.76, a1, 0.1), { decor: true, shade: 0.85 });
          faceBox(sink, 'structureMetal', f, Math.cos(a0) * 0.5, cy + Math.sin(a0) * 0.5, 0.045, 0.05, 0.05, 0.03, { colour: IRON, decor: true, fine: true });
        }
        sink.member('structureMetal', facePoint(f, 0, cy, 0.05), facePoint(f, 0.12, cy + 0.42, 0.05), 0.05, 0.02, f.out, { colour: IRON, decor: true, exposed: true }, 0);
        sink.member('structureMetal', facePoint(f, 0, cy, 0.07), facePoint(f, -0.3, cy - 0.12, 0.07), 0.06, 0.02, f.out, { colour: IRON, decor: true, exposed: true }, 0);
        faceBox(sink, 'structureMetal', f, 0, cy, 0.06, 0.1, 0.1, 0.06, { colour: IRON, decor: true });
      }
      faceBox(sink, 'stone', f, 0, th - 0.15, 0.1, tw + 0.25, 0.3, 0.2, { decor: true });
    }
    const tf: Face = { origin: [0, 0, tz1], u: [1, 0, 0], out: [0, 0, 1], width: tw };
    archHead(sink, tf, 0, 3.3, 1.05, 'stone', 0.26, 2);
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
    // (props census #7, lane B 2026-10-14: the shell holes in the left side were dark plates on the render) two shells'
    // breaches cut through the side wall clear of its windows, into the hall's dark
    const breaches: Array<{ face: 'left'; storey: number; u: number; y: number; r: number; seed: number; spall: RegionalBucket }> = [];
    for (let k = 0; k < 2; k++) {
      const u = (look() - 0.5) * D * 0.7, y = hH * (0.45 + look() * 0.1) - 0.5, r = 0.4 + look() * 0.3;
      const clear = openings.filter((o) => o.face === 'left').every((o) => Math.abs(o.u - u) > o.w / 2 + r + 0.15 || y + r + 0.15 < o.y0 || y - r - 0.15 > o.y0 + o.h);
      if (clear) breaches.push({ face: 'left', storey: 0, u, y, r, seed: Math.floor(look() * 1e9), spall: 'stone' });
    }
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.5, out: 0.06, bucket: 'stone' }, storeys: [{ h: hH, wall: 'plaster2' }],
      roof: { kind: 'gable', pitchDeg: 28, eave: 0.6, verge: 0.35, thickness: 0.16, bucket: 'roof', ridge: 'saddle' }, gableBucket: 'plaster2',
      openings, chimneys: [], gutters: { colour: ZINC }, verge: null, reveal: 0.34, rafters: null, spall: 'stone', breaches,
    }, dialect);
    const b = frame.bodies[0], rg = frame.roof;
    sink.band('stone', b.x0 - 0.2, hH - 0.15, b.z0 - 0.2, b.x1 + 0.2, hH + 0.4, b.z1 + 0.2, { decor: true });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      sink.span('stone', sx > 0 ? b.x1 - 0.5 : b.x0 - 0.12, 0, sz > 0 ? b.z1 - 0.5 : b.z0 - 0.12, sx > 0 ? b.x1 + 0.12 : b.x0 + 0.5, hH - 0.15, sz > 0 ? b.z1 + 0.12 : b.z0 + 0.5, { decor: true });
    }
    // the ridge lantern: a louvred clerestory along the ridge under its own roof (props census #4, lane B 2026-10-14:
    // "a dark panel on a plaster box, slats on it"): its sill wall on the ridge and the wall plate its roof sits on,
    // carried on the end walls and piers; between them the louvres, in front of the open dark of the roof space
    const lw = clampTo(W * 0.22, 1.6, 3.4), ll = D - 3.0;
    const ly0 = rg.ridgeY + 0.3, ly1 = rg.ridgeY + 0.95;
    sink.span('plaster2', -lw / 2, rg.ridgeY - 1.0, -ll / 2, lw / 2, ly0, ll / 2);
    sink.span('plaster2', -lw / 2, ly1, -ll / 2, lw / 2, rg.ridgeY + 1.1, ll / 2);
    const piers = Math.max(2, Math.round(ll / 3));
    for (let k = 0; k <= piers; k++) {
      // (the end walls 30 cm thick at the lantern's ends, the piers 30 cm between)
      const z = -ll / 2 + ll * k / piers, z0 = k === 0 ? z : k === piers ? z - 0.3 : z - 0.15, z1 = k === 0 ? z + 0.3 : k === piers ? z : z + 0.15;
      sink.span('plaster2', -lw / 2, ly0, z0, lw / 2, ly1, z1);
    }
    sink.span('dark', -lw / 2 + 0.3, ly0, -ll / 2 + 0.3, lw / 2 - 0.3, ly1, ll / 2 - 0.3, { decor: true });
    for (const s of [-1, 1]) {
      const f: Face = { origin: [s * lw / 2, 0, 0], u: [0, 0, -s], out: [s, 0, 0], width: ll };
      if (!mobile) for (let y = ly0 + 0.05; y < ly1 - 0.04; y += 0.16) faceBox(sink, 'structureWood', f, 0, y, 0.03, ll - 0.6, 0.04, 0.06, { colour: IRON, decor: true, fine: true });
    }
    const cap: RoofSpec = { kind: 'gable', pitchDeg: 26, eave: 0.3, verge: 0.3, thickness: 0.12, bucket: 'roof', ridge: 'saddle' };
    emitRoof(sink, roofGeometry(lw, ll, rg.ridgeY + 1.1, cap), cap);
    // the clock in the front gable
    const ff = frame.faces.front;
    const clockY = hH + (rg.ridgeY - hH) * 0.42;
    sink.polygon('structureWood', Array.from({ length: 12 }, (_, j) => facePoint(ff, Math.cos(j / 12 * Math.PI * 2) * 0.75, clockY + Math.sin(j / 12 * Math.PI * 2) * 0.75, 0.04)), { decor: true, colour: rgb(0xe0dccc) });
    faceBox(sink, 'structureMetal', ff, 0, clockY + 0.2, 0.06, 0.05, 0.5, 0.02, { colour: IRON, decor: true });

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
