// src/world/maps/regional/andalusian.ts — the Andalusian kit (Aegis Crossing: Ronda and the Tajo of the Guadalevín,
// Málaga; map-revival lane 2, 2026-10-05). The white towns of the Serranía de Ronda: houses limewashed every spring
// over rubble or brick, under low roofs of curved clay tiles (teja árabe, canal tiles) that run out over the street in
// two corbelled courses of whitewashed tile and barely pass the gables; painted dados (zócalos) and door and window
// bands in albero ochre or grey; wrought-iron window grilles (rejas, the projecting box reja on the ground floor) and
// iron balconies on the floors above, the odd glazed cierro; panelled street doors in walnut or bottle green in a
// dressed stone or painted surround; geraniums in pots hung on the walls; whitewashed stacks under little tile hoods.
// The town's public buildings: the casa consistorial with its arcaded ground floor (soportales) on the square and the
// clock and bell gable over the eaves; the stone church with its buttressed nave and its belfry tower; the white
// hermitage (ermita) with its bell gable (espadaña); a Nasrid wall tower with pointed merlons by the bridgehead; the
// old flour mills in the gorge, roofless, their arched races dry. In the country: the cortijo round its patio (the
// two-storey house, the stable wing, the walled patio with its arched gateway and bell), the whitewashed barn with its
// arched cart door, the dovecote, the bread oven in the yard, and prickly pear (chumbera) clumps by the walls.
import {
  LocalFrame, PartSink, faceBox, facePoint, normalize3, pick, rgb, shade, UV_MEMBER,
  type Face, type RegionalBucket, type RegionalParts, type Rgb, type Vec3,
} from './geometry.ts';
import {
  buildHouse, emitRoof, roofGeometry, storeyFaces, wallPolygon, windowRhythm,
  type HouseDialect, type HouseFrame, type HouseSpec, type Opening, type RoofSpec, type StoreySpec,
} from './house.ts';
import { doorUnit, gateUnit, windowUnit, type WindowStyle } from './openings.ts';
import { wallLantern, woodpile } from './dressing.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder } from './types.ts';

const IRON = rgb(0x1d1e20);
const FRAME_WHITE = rgb(0xe4e0d6);
/** Window and shutter paints: bottle green, a darker green, walnut, dark brown, oxblood, a grey-green. */
const JOINERY: readonly Rgb[] = [0x355a3c, 0x2c4632, 0x5a3e2a, 0x45301f, 0x6e2c22, 0x4e5f52].map(rgb);
/** Street doors: walnut and chestnut, the odd green one. */
const DOOR_WOOD: readonly Rgb[] = [0x5a3e2a, 0x4a3322, 0x6b4a30, 0x3e2b1e, 0x2f4a36].map(rgb);
const CLAY = rgb(0xa65a36), CLAY_BLUE = rgb(0x2f5f9a);
const BLOOMS: readonly Rgb[] = [0xc8282e, 0xd94a6a, 0xb52446, 0xe6e0d8, 0xd6602a].map(rgb);
const LEAF = rgb(0x3d5a2a);
const BELL = rgb(0x6a5a3a);
const CACTUS = rgb(0x66794a), CACTUS_FRUIT = rgb(0x9a2a40);
// the blinds hung outside the windows: esparto grass, sun-bleached; a few slatted ones painted the joinery's green
const ESPARTO = rgb(0x9a8256), BLIND_GREEN = rgb(0x46604a);

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

// ------------------------------------------------------------------------------------------------ the dialect

interface AndalusianState {
  rng: () => number;
  window: WindowStyle;
  joinery: Rgb;
  door: Rgb;
  /** the band painted round doors and windows (and the dado): albero ochre, grey, or none (plain white reveals) */
  band: RegionalBucket | null;
  /** the ground-floor grilles: the projecting box reja, the flat one, or none */
  reja: 'box' | 'flat' | null;
  litShare: number;
  mobile: boolean;
  /** a long balcony (balcón corrido) along one storey of the street face: its doors take no balcony of their own */
  longBalcony?: { face: string; storey: number; u0: number; u1: number };
}

function stateFor(ctx: RegionalBuildContext): AndalusianState {
  const rng = ctx.rng;
  const joinery = pick(rng, JOINERY);
  const bandRoll = rng();
  const band: RegionalBucket | null = bandRoll < 0.45 ? 'plaster2' : bandRoll < 0.7 ? 'plaster3' : null;
  const shutters = rng() < 0.35;
  return {
    rng, joinery, door: pick(rng, DOOR_WOOD), band,
    window: {
      frame: rng() < 0.55 ? FRAME_WHITE : joinery, frameWidth: 0.06, frameOut: 0.04, bars: rng() < 0.65 ? 'six' : 'cross',
      surround: band ? { bucket: band, width: 0.15, out: 0.015, lintel: 0.17 } : null,
      sill: { bucket: band ?? 'plaster', out: 0.06 },
      shutters: shutters ? { colour: joinery, kind: 'plank', closed: 0.25 } : null,
    },
    reja: rng() < 0.62 ? 'box' : 'flat',
    // (round 2: most panes curtained by day, net and cotton behind the glass — at 0.38 the bare glass read as black voids)
    litShare: 0.7,
    mobile: ctx.tier === 'mobile',
  };
}

/**
 * A wrought-iron window grille over the opening (u, y bottom-centre, w × h): the frame of flats, the square bars (fine
 * joinery: a long view reads the frame), two horizontal flats; the box reja stands out from the wall on four returns
 * and carries a little tile hood.
 */
function reja(sink: PartSink, face: Face, u: number, y: number, w: number, h: number, box: boolean): void {
  const c = { colour: IRON, decor: true } as const;
  const out = box ? 0.2 : 0.04;
  const x0 = u - w / 2 - 0.06, x1 = u + w / 2 + 0.06, y0 = y - 0.06, y1 = y + h + 0.06;
  const cu = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  for (const x of [x0, x1]) faceBox(sink, 'structureMetal', face, x, cy, out, 0.035, y1 - y0, 0.035, c);
  for (const yy of [y0, y1]) faceBox(sink, 'structureMetal', face, cu, yy, out, x1 - x0 + 0.035, 0.035, 0.035, c, 'ends');
  if (box) {
    for (const yy of [y0, y1]) for (const x of [x0, x1]) faceBox(sink, 'structureMetal', face, x, yy, out / 2, 0.03, 0.03, out, c);
    // the tile hood over the box: a short slab of the roof's tiles falling outward
    const pts: Vec3[] = [facePoint(face, x0 - 0.08, y1 + 0.04, out + 0.12), facePoint(face, x1 + 0.08, y1 + 0.04, out + 0.12),
      facePoint(face, x1 + 0.08, y1 + 0.24, 0), facePoint(face, x0 - 0.08, y1 + 0.24, 0)];
    const n = normalize3([face.out[0] * 0.2, 1, face.out[2] * 0.2]);
    sink.prism('roof', pts, n, 0.06, { decor: true, shadow: true });
  }
  const bars = Math.max(3, Math.round((x1 - x0) / 0.12));
  for (let k = 1; k < bars; k++) {
    faceBox(sink, 'structureMetal', face, x0 + (x1 - x0) * k / bars, cy, out, 0.02, y1 - y0, 0.02, { ...c, fine: true }, 'caps');
  }
  for (const t of [0.34, 0.68]) faceBox(sink, 'structureMetal', face, cu, y0 + (y1 - y0) * t, out + 0.012, x1 - x0, 0.03, 0.01, { ...c, fine: true }, 'ends');
}

/**
 * An iron balcony on a door of an upper floor: a stone slab on two iron brackets, the railing round it (the rails and
 * the corner posts coarse, the balusters fine joinery), a pot or two on the slab.
 */
function balcony(sink: PartSink, face: Face, u: number, floorY: number, w: number, depth: number, look: () => number, mobile: boolean): void {
  const c = { colour: IRON, decor: true } as const;
  faceBox(sink, 'stone', face, u, floorY - 0.07, depth / 2, w, 0.14, depth, { decor: true, shadow: true });
  for (const s of [-1, 1]) faceBox(sink, 'structureMetal', face, u + s * (w / 2 - 0.18), floorY - 0.3, depth * 0.35, 0.04, 0.32, depth * 0.7, c);
  const d = depth - 0.03, top = floorY + 0.98;
  faceBox(sink, 'structureMetal', face, u, top, d, w - 0.02, 0.045, 0.045, c);
  faceBox(sink, 'structureMetal', face, u, floorY + 0.12, d, w - 0.02, 0.03, 0.03, c);
  for (const s of [-1, 1]) {
    faceBox(sink, 'structureMetal', face, u + s * (w / 2 - 0.02), top, d / 2, 0.045, 0.045, d, c);
    faceBox(sink, 'structureMetal', face, u + s * (w / 2 - 0.02), (floorY + top) / 2, d, 0.04, top - floorY, 0.04, c);
  }
  const fine = { ...c, fine: true };
  const n = Math.max(4, Math.round(w / 0.13));
  for (let k = 1; k < n; k++) faceBox(sink, 'structureMetal', face, u - w / 2 + w * k / n, floorY + 0.55, d, 0.018, 0.84, 0.018, fine, 'caps');
  const m = Math.max(2, Math.round(d / 0.13));
  for (const s of [-1, 1]) for (let k = 1; k < m; k++) faceBox(sink, 'structureMetal', face, u + s * (w / 2 - 0.02), floorY + 0.55, d * k / m, 0.018, 0.84, 0.018, fine, 'caps');
  if (look() < 0.7) sink.dressing(mobile, () => {
    for (const s of [-1, 1]) {
      if (look() < 0.35) continue;
      potOn(sink, facePoint(face, u + s * (w / 2 - 0.22), floorY, d - 0.14), 0.26, look);
    }
  });
}

/** A clay pot with a geranium on a ledge (p: the pot's base). */
function potOn(sink: PartSink, p: Vec3, size: number, look: () => number): void {
  const clay = look() < 0.2 ? CLAY_BLUE : shade(CLAY, 0.85 + look() * 0.3);
  sink.cylinder('structureWood', p, 'y', size * 0.7, size * 0.36, 7, { colour: clay, decor: true }, size * 0.46);
  const bloom = pick(look, BLOOMS);
  sink.cylinder('structureWood', [p[0], p[1] + size * 0.7, p[2]], 'y', size * 0.45, size * 0.5, 7, { colour: shade(LEAF, 0.85 + look() * 0.3), decor: true }, size * 0.3);
  sink.cylinder('structureWood', [p[0], p[1] + size * 1.0, p[2]], 'y', size * 0.22, size * 0.34, 6, { colour: bloom, decor: true }, size * 0.12);
}

/**
 * Geraniums in clay pots hung on the wall on iron hooks between u0 and u1 at height y (the Andalusian patio and street
 * wall): every half metre or so a hook, a pot, its foliage and blooms, a trailing stem below it.
 */
function wallPots(sink: PartSink, face: Face, u0: number, u1: number, y: number, look: () => number,
  avoid: ReadonlyArray<readonly [number, number]> = []): void {
  for (let u = u0; u <= u1; u += 0.42 + look() * 0.25) {
    if (look() < 0.18 || avoid.some(([a, b]) => u > a - 0.25 && u < b + 0.25)) continue;
    const yy = y + (look() - 0.5) * 0.3, size = 0.22 + look() * 0.08;
    faceBox(sink, 'structureMetal', face, u, yy + size * 0.5, 0.06, 0.03, 0.03, 0.12, { colour: IRON, decor: true });
    const p = facePoint(face, u, yy - size * 0.1, 0.16);
    potOn(sink, p, size, look);
    if (look() < 0.5) faceBox(sink, 'structureWood', face, u, yy - size * 0.45, 0.17, size * 0.5, size * 0.9, size * 0.3, { colour: shade(LEAF, 0.8 + look() * 0.3), decor: true });
  }
}

/**
 * The painted dado round the ground storey (zócalo): a band 12 mm proud of the render from the plinth to `height`,
 * broken at the doors.
 */
function zocalo(sink: PartSink, frame: HouseFrame, bucket: RegionalBucket, height: number): void {
  const faces = storeyFaces(frame, 0);
  const y0 = frame.floors[0] - 0.02, y1 = frame.floors[0] + height;
  for (const name of ['front', 'right', 'back', 'left'] as const) {
    const face = faces[name];
    const doors = frame.spec.openings.filter((o) => o.face === name && o.storey === 0 && o.kind !== 'window' && o.kind !== 'loft')
      .map((o) => [o.u - o.w / 2 - 0.22, o.u + o.w / 2 + 0.22] as const).sort((a, b) => a[0] - b[0]);
    let cur = -face.width / 2;
    const strip = (a: number, b: number) => {
      if (b - a < 0.05) return;
      sink.quad(bucket, facePoint(face, a, y0, 0.012), facePoint(face, b, y0, 0.012), facePoint(face, b, y1, 0.012), facePoint(face, a, y1, 0.012), { decor: true });
    };
    for (const [a, b] of doors) { strip(cur, Math.max(cur, a)); cur = Math.max(cur, b); }
    strip(cur, face.width / 2);
  }
}

/**
 * The tile eave (alero): two corbelled courses of whitewashed tile under the roof's edge along both eaves sides of the
 * top storey (the grammar's ±x).
 */
function alero(sink: PartSink, frame: HouseFrame): void {
  const b = frame.bodies[frame.bodies.length - 1];
  const y = frame.eaveY;
  for (const side of [-1, 1]) {
    const x = side > 0 ? b.x1 : b.x0;
    // round 2 (gauntlet wave 108b: "thin flat roof slabs with no eave or ridge depth"): the upper course is the tiles'
    // own red ends bedded in lime under the eave, the lower one whitewashed, each standing further out
    sink.span('roof', x, y - 0.12, b.z0 - 0.06, x + side * 0.2, y, b.z1 + 0.06, { decor: true, shadow: true });
    sink.span('plaster', x, y - 0.25, b.z0 - 0.03, x + side * 0.1, y - 0.12, b.z1 + 0.03, { decor: true, shadow: true });
  }
  // the ridge's caballete: a row of cap tiles bedded proud of the ridge, end to end along it
  const roof = frame.roof;
  if ((roof.kind === 'gable' || roof.kind === 'hip') && roof.ridgeHalf > 0.3) {
    const over = roof.kind === 'gable' ? 0.06 : 0;
    sink.cylinder('roof', [0, roof.ridgeTopY + 0.03, -roof.ridgeHalf - over], 'z', 2 * (roof.ridgeHalf + over), 0.13, 7,
      { decor: true, shadow: true }, 0.13, true, -Math.PI / 2, Math.PI);
  }
}

/** A string course (impost band) round a body at height y (decor, its top and underside fine joinery). */
function band(sink: PartSink, frame: HouseFrame, storey: number, y: number, h: number, out: number, bucket: RegionalBucket): void {
  const b = frame.bodies[storey];
  sink.band(bucket, b.x0 - out, y - h / 2, b.z0 - out, b.x1 + out, y + h / 2, b.z1 + out, { decor: true });
}

/**
 * The spandrels of an arch in a wall plane: the ground between the intrados (a half circle of half-width r springing at
 * `spring`, its rise `rise`) and the head line `top`, as vertical strips (each convex) `depth` thick, and the voussoirs
 * round the intrados. `top` must stand over the crown.
 */
function archFill(sink: PartSink, face: Face, uc: number, r: number, spring: number, rise: number, top: number, depth: number,
  wall: RegionalBucket, voussoir: RegionalBucket | null, decor: boolean, n = 10, through = false): void {
  const at = (i: number): [number, number] => { const a = Math.PI * i / n; return [uc - Math.cos(a) * r, spring + Math.sin(a) * rise]; };
  for (let i = 0; i < n; i++) {
    const [ua, ya] = at(i), [ub, yb] = at(i + 1);
    wallPolygon(sink, wall, face, [[ua, ya], [ub, yb], [ub, top], [ua, top]], depth, decor ? { decor: true } : {});
  }
  if (!voussoir) return;
  // the voussoirs: a ring of dressed stones along the intrados, each a member from joint to joint
  const ring = Math.min(0.3, (top - spring - rise) + 0.12);
  const joint = (i: number): Vec3 => {
    const a = Math.PI * i / n;
    return facePoint(face, uc - Math.cos(a) * (r + ring / 2), spring + Math.sin(a) * (rise + ring / 2), 0);
  };
  // (an arch seen through, a belfry's, shows the ring's back through the opening: every face then)
  for (let i = 0; i < n; i++) sink.member(voussoir, joint(i), joint(i + 1), ring, 0.05, face.out, { decor: true, ends: true, exposed: through }, 0.01);
}

/**
 * A bell gable (espadaña) on a wall plane: a base course, two piers either side of the bell's opening, the head over it
 * and its pediment, the bell hung in the opening on an iron yoke, the cross on the apex. (u 0: its axis; y0: its foot.)
 */
function espadana(sink: PartSink, face: Face, y0: number, w: number, depth: number, bell: number, mobile: boolean, cross = true): void {
  const ow = bell * 2.3, oh = bell * 3.0, base = y0 + 0.5, head = base + oh;
  wallPolygon(sink, 'plaster', face, [[-w / 2, y0], [w / 2, y0], [w / 2, base], [-w / 2, base]], depth);
  wallPolygon(sink, 'plaster', face, [[-w / 2, base], [-ow / 2, base], [-ow / 2, head], [-w / 2, head]], depth);
  wallPolygon(sink, 'plaster', face, [[ow / 2, base], [w / 2, base], [w / 2, head], [ow / 2, head]], depth);
  archFill(sink, face, 0, ow / 2, head - ow / 2 * 0.8 - 0.05, ow / 2 * 0.8, head, depth, 'plaster', null, false);
  const top = head + 0.32;
  wallPolygon(sink, 'plaster', face, [[-w / 2, head], [w / 2, head], [w / 2, top], [-w / 2, top]], depth);
  wallPolygon(sink, 'plaster', face, [[-w / 2 - 0.08, top], [w / 2 + 0.08, top], [0, top + w * 0.32]], depth);
  const mid = facePoint(face, 0, 0, -depth / 2);
  sink.cylinder('structureMetal', [mid[0], base + oh * 0.28, mid[2]], 'y', bell * 1.05, bell, 10, { colour: BELL, decor: true }, bell * 0.5);
  if (!mobile) {
    faceBox(sink, 'structureMetal', face, 0, base + oh * 0.28 + bell * 1.12, -depth / 2, ow + 0.1, 0.07, 0.07, { colour: IRON, decor: true }, 'ends');
  }
  // (a farm gate's gable carries none: over the trees round a cortijo the iron cross read as a floating marker, wave 108b)
  if (!cross) return;
  const apex = facePoint(face, 0, top + w * 0.32, -depth / 2);
  sink.span('structureMetal', apex[0] - 0.03, apex[1] - 0.1, apex[2] - 0.03, apex[0] + 0.03, apex[1] + 0.75, apex[2] + 0.03, { colour: IRON, decor: true });
  const arm = facePoint(face, 0.22, top + w * 0.32 + 0.45, -depth / 2), arm2 = facePoint(face, -0.22, top + w * 0.32 + 0.45, -depth / 2);
  sink.span('structureMetal', Math.min(arm[0], arm2[0]) - 0.03, arm[1] - 0.03, Math.min(arm[2], arm2[2]) - 0.03,
    Math.max(arm[0], arm2[0]) + 0.03, arm[1] + 0.03, Math.max(arm[2], arm2[2]) + 0.03, { colour: IRON, decor: true });
}

/**
 * A prickly pear clump (chumbera, Opuntia) at (x, z): flat oval pads in branching chains, the old ones grey-green and
 * corky at the foot, the fruit (higos chumbos) red along the top pads' edges. Dressing that casts its shadow.
 */
function chumbera(sink: PartSink, x: number, z: number, size: number, look: () => number): void {
  const opts = (c: Rgb) => ({ colour: c, decor: true, shadow: true });
  const pad = (cx: number, cy: number, cz: number, theta: number, phi: number, s: number, c: Rgb) => {
    const az: Vec3 = [Math.sin(theta), 0, Math.cos(theta)];
    const ax0: Vec3 = [Math.cos(theta), 0, -Math.sin(theta)];
    const ax: Vec3 = [ax0[0] * Math.cos(phi), Math.sin(phi), ax0[2] * Math.cos(phi)];
    const ay: Vec3 = [-ax0[0] * Math.sin(phi), Math.cos(phi), -ax0[2] * Math.sin(phi)];
    sink.box('structureWood', [cx, cy, cz], [0.15 * s, 0.2 * s, 0.03 * s], opts(c), new LocalFrame(ax, ay, az, [cx, cy, cz]));
  };
  const stems = 3 + Math.floor(look() * 3);
  for (let i = 0; i < stems; i++) {
    let theta = look() * Math.PI * 2, cx = x + (look() - 0.5) * size * 0.5, cz = z + (look() - 0.5) * size * 0.5, cy = 0.18 * size;
    let phi = (look() - 0.5) * 0.6;
    const len = 2 + Math.floor(look() * 3);
    for (let k = 0; k < len; k++) {
      const s = size * (1 - k * 0.08);
      const c = k === 0 ? shade(CACTUS, 0.82) : shade(CACTUS, 0.9 + look() * 0.25);
      pad(cx, cy, cz, theta, phi, s, c);
      if (k === len - 1 && look() < 0.7) {
        for (let f = 0; f < 3; f++) {
          const a = phi + (f - 1) * 0.5, r = 0.2 * s;
          sink.box('structureWood', [cx + Math.cos(theta) * Math.sin(a) * r, cy + Math.cos(a) * r, cz - Math.sin(theta) * Math.sin(a) * r],
            [0.035 * s, 0.045 * s, 0.035 * s], opts(CACTUS_FRUIT));
        }
      }
      // the next pad grows from this one's rim, turned and leaning
      cy += 0.33 * s * Math.cos(phi); cx += Math.cos(theta) * Math.sin(phi) * 0.33 * s; cz -= Math.sin(theta) * Math.sin(phi) * 0.33 * s;
      theta += (look() - 0.5) * 1.6; phi = clamp(phi + (look() - 0.5) * 0.9, -0.9, 0.9);
    }
  }
}

/**
 * An esparto blind (persiana de esparto) hung outside an upper window from a hook over its lintel and let down part way
 * against the sun, rolled at its foot — the Andalusian street's most common window (round 2, gauntlet wave 108b: the
 * glass read as "black window voids"). Dressing, from the house's look stream.
 */
function persiana(sink: PartSink, face: Face, u: number, y: number, w: number, h: number, look: () => number): void {
  const drop = h * (0.3 + look() * 0.55), top = y + h + 0.12, bottom = top - drop - 0.12;
  const colour = look() < 0.75 ? shade(ESPARTO, 0.86 + look() * 0.26) : shade(BLIND_GREEN, 0.9 + look() * 0.2);
  const opts = { colour, decor: true, shadow: true } as const;
  faceBox(sink, 'structureWood', face, u, (top + bottom) / 2, 0.07, w + 0.16, top - bottom, 0.016, opts);
  faceBox(sink, 'structureWood', face, u, bottom + 0.045, 0.085, w + 0.18, 0.09, 0.08, opts);
}

function dialect(st: AndalusianState, look: () => number): HouseDialect {
  return {
    window: (sink, face, o, y0) => {
      const loft = o.kind === 'loft';
      windowUnit(sink, face, o.u, y0 + o.y0, o.w, o.h, loft ? { ...st.window, shutters: null, bars: 'none', surround: null } : st.window,
        st.rng, loft ? 0 : st.litShare);
      if (!loft && o.storey === 0 && st.reja) reja(sink, face, o.u, y0 + o.y0, o.w, o.h, st.reja === 'box');
      if (!loft && o.storey > 0 && look() < 0.45) persiana(sink, face, o.u, y0 + o.y0, o.w, o.h, look);
    },
    door: (sink, face, o, y0, frame) => {
      if (o.kind === 'gate') {
        gateUnit(sink, face, o.u, y0 + o.y0, o.w, o.h, shade(st.door, 0.9), { bucket: 'stone', width: 0.24, out: 0.06 });
        return;
      }
      if (o.storey > 0) {
        // a balcony door: glazed leaves under a transom, the iron balcony on its slab
        doorUnit(sink, face, o.u, y0 + o.y0, o.w, o.h, {
          leaf: st.joinery, frame: { bucket: st.band ?? 'plaster', width: 0.14, out: 0.015 }, steps: null, leafKind: 'glazed', transom: true,
        });
        const lb = st.longBalcony;
        if (!(lb && lb.face === o.face && lb.storey === o.storey && o.u >= lb.u0 && o.u <= lb.u1)) balcony(sink, face, o.u, y0 + o.y0, o.w + 0.55, 0.5, look, st.mobile);
        return;
      }
      doorUnit(sink, face, o.u, y0 + o.y0, o.w, o.h, {
        leaf: st.door, frame: { bucket: st.band ?? 'stone', width: 0.22, out: 0.03, arch: o.w > 1.3 },
        steps: { bucket: 'stone' }, leafKind: 'panel', transom: false,
      }, frame.floors[o.storey] + o.y0);
    },
  };
}

/** Build `body` with the grammar's ridge (its z) along the plot's x: the grammar's +x (its 'right' face) is the street. */
function streetwise(sink: PartSink, body: () => void): void {
  sink.placed(-Math.PI / 2, 0, 0, 0, body);
}

const canal = (pitch: number, eave = 0.28, verge = 0.06, kind: RoofSpec['kind'] = 'gable'): RoofSpec =>
  ({ kind, pitchDeg: pitch, eave, verge: kind === 'hip' ? eave : verge, thickness: 0.2, bucket: 'roof', ridge: 'round' });

// ------------------------------------------------------------------------------------------------ the houses

/**
 * The village house (casa): one or two storeys of limewash on a low stone plinth, the roof's ridge along the street,
 * the door and the grilled windows on the street front, a low attic (cámara) with its small square vents on many
 * single-storey houses, a whitewashed stack under a tile hood; a dado and the painted bands on most, pots on the wall,
 * a masonry bench (poyo) by the door, a lantern.
 */
function casa(ctx: RegionalBuildContext, opts: { two?: boolean } = {}): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const rng = st.rng, look = ctx.variant;
  const fit = wallsIn(ctx, 0.09, 0.28);
  const W = clamp(fit.w, 4.8, 10), D = clamp(fit.d, 6.0, 12);
  const two = opts.two ?? rng() < 0.5;
  const camara = !two && rng() < 0.55;
  const wall: RegionalBucket = ctx.wallBucket === 'plaster2' && look() < 0.45 ? 'plaster2' : 'plaster';
  const sts: StoreySpec[] = [{ h: 2.85 + rng() * 0.2, wall }];
  if (two) sts.push({ h: 2.55 + rng() * 0.2, wall });
  else if (camara) sts.push({ h: 1.2, wall });
  const openings: Opening[] = [];
  // the street front: the grammar's 'right' face, W wide (u runs along the street)
  const du = (rng() - 0.5) * W * 0.3, dw = W > 6 ? 1.25 : 1.1;
  openings.push({ face: 'right', storey: 0, kind: 'door', u: du, w: dw, y0: 0, h: 2.3 });
  for (const o of windowRhythm('right', 0, W, { w: 0.85, h: 1.15, sill: 0.95, spacing: 1.9, margin: 0.75, avoid: [[du - dw / 2, du + dw / 2]], max: 3 })) openings.push(o);
  if (two) {
    const bal = rng() < 0.55;
    if (bal) openings.push({ face: 'right', storey: 1, kind: 'door', u: du, w: 0.95, y0: 0, h: 2.1 });
    for (const o of windowRhythm('right', 1, W, { w: 0.8, h: 1.05, sill: 0.85, spacing: 1.9, margin: 0.8, avoid: bal ? [[du - 0.5, du + 0.5]] : [], max: 3 })) openings.push(o);
    for (const o of windowRhythm('left', 1, W, { w: 0.7, h: 0.95, sill: 0.95, spacing: 2.4, margin: 1.0, max: 2 })) openings.push(o);
  } else if (camara) {
    for (const o of windowRhythm('right', 1, W, { w: 0.42, h: 0.36, sill: 0.42, spacing: 1.6, margin: 0.9, kind: 'loft', max: 3 })) openings.push(o);
  }
  for (const o of windowRhythm('left', 0, W, { w: 0.65, h: 0.8, sill: 1.3, spacing: 2.6, margin: 1.2, max: 2 })) openings.push(o);
  if (rng() < 0.5) openings.push({ face: rng() < 0.5 ? 'front' : 'back', storey: two ? 1 : 0, kind: 'window', u: (rng() - 0.5) * D * 0.3, w: 0.6, h: 0.75, y0: 1.0 });
  const roof = canal(18 + rng() * 6, 0.28);
  const chimneyZ = (rng() < 0.5 ? -1 : 1) * (W / 2 - 0.75);
  const spec: HouseSpec = {
    w: D, d: W, plinth: { h: 0.22, out: 0.03, bucket: 'stone' }, storeys: sts, roof, gableBucket: wall, openings,
    chimneys: [{ x: -D * 0.2, z: chimneyZ, sx: 0.55, sz: 0.6, above: 0.75, bucket: 'plaster', cap: 'tile' }],
    gutters: null, verge: null, spall: null, reveal: 0.22,
  };
  const dado = st.band && look() < 0.7, bench = look() < 0.5, pots = look() < 0.55, lantern = look() < 0.4;
  sink.placed(0, fit.cx, 0, fit.cz, () => streetwise(sink, () => {
    const frame = buildHouse(sink, spec, dialect(st, look));
    alero(sink, frame);
    if (dado && st.band) zocalo(sink, frame, st.band, 0.75);
    sink.dressing(st.mobile, () => {
      const f = frame.faces.right;
      if (bench) {
        const u = du + (du > 0 ? -1 : 1) * (dw / 2 + 0.95);
        if (Math.abs(u) + 0.75 < W / 2) faceBox(sink, 'plaster', f, u, 0.22, 0.21, 1.3, 0.44, 0.42, { decor: true, shadow: true });
      }
      const spans = openings.filter((o) => o.face === 'right').map((o) => [o.u - o.w / 2 - 0.2, o.u + o.w / 2 + 0.2] as const);
      if (pots) wallPots(sink, f, -W / 2 + 0.5, W / 2 - 0.5, two ? frame.floors[1] - 0.35 : 2.45, look, two ? [] : spans);
      const lu = du + (dw / 2 + 0.45) * (du > 0 ? -1 : 1);
      if (lantern && !spans.some(([a, b]) => lu > a - 0.15 && lu < b + 0.15)) wallLantern(sink, f, lu, 2.55);
    });
  }));
  return sink.finish();
}

/**
 * The town house: two or three storeys with a tall ground floor, the street door in a dressed stone portada between
 * box rejas, iron balconies on the main floor (one long balcony across the middle on some, a glazed cierro on others),
 * smaller windows or balconies above, a painted impost band and a cornice under the tile eave.
 */
function townhouse(ctx: RegionalBuildContext, opts: { shop?: boolean } = {}): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const rng = st.rng, look = ctx.variant;
  const fit = wallsIn(ctx, 0.1, 0.32);
  const W = clamp(fit.w, 6.5, 12.5), D = clamp(fit.d, 7, 13.5);
  const three = rng() < 0.55;
  const wall: RegionalBucket = ctx.wallBucket === 'plaster3' && look() < 0.4 ? 'plaster2' : 'plaster';
  const sts: StoreySpec[] = [{ h: 3.4, wall }, { h: 3.05, wall }];
  if (three) sts.push({ h: 2.7, wall });
  const openings: Opening[] = [];
  const bays = W > 9.4 ? 3 : 2;
  const bayU = (k: number) => (k - (bays - 1) / 2) * (W - 2.2) / Math.max(1, bays - 1);
  // the street front: the door on the middle bay (or the shop door on one side), windows on the others
  const doorBay = bays === 3 ? 1 : (rng() < 0.5 ? 0 : 1);
  for (let k = 0; k < bays; k++) {
    const u = bayU(k);
    if (k === doorBay) openings.push({ face: 'right', storey: 0, kind: 'door', u, w: opts.shop ? 1.7 : 1.45, y0: 0, h: 2.75 });
    else openings.push({ face: 'right', storey: 0, kind: 'window', u, w: 1.0, h: 1.55, y0: 0.95 });
  }
  const cierroBay = !opts.shop && rng() < 0.3 ? doorBay : -1;
  const long = cierroBay < 0 && bays === 3 && rng() < 0.4;
  for (let k = 0; k < bays; k++) {
    const u = bayU(k);
    if (k === cierroBay) openings.push({ face: 'right', storey: 1, kind: 'window', u, w: 1.1, h: 1.7, y0: 0.55 });
    else if (!long || k !== 1) openings.push({ face: 'right', storey: 1, kind: 'door', u, w: 1.0, y0: 0, h: 2.35 });
    else openings.push({ face: 'right', storey: 1, kind: 'door', u, w: 1.05, y0: 0, h: 2.35 });
    if (three) {
      if (rng() < 0.45) openings.push({ face: 'right', storey: 2, kind: 'door', u, w: 0.9, y0: 0, h: 2.05 });
      else openings.push({ face: 'right', storey: 2, kind: 'window', u, w: 0.8, h: 1.1, y0: 0.75 });
    }
  }
  for (let i = 0; i < sts.length; i++) {
    for (const o of windowRhythm('left', i, W, { w: 0.8, h: i ? 1.1 : 0.95, sill: i ? 0.85 : 1.2, spacing: 2.4, margin: 1.0, max: 3 })) openings.push(o);
    if (rng() < 0.6) for (const o of windowRhythm(rng() < 0.5 ? 'front' : 'back', i, D, { w: 0.7, h: 0.95, sill: 1.0, spacing: 3.2, margin: 1.6, max: 2 })) {
      if (i > 0) openings.push(o);
    }
  }
  const spec: HouseSpec = {
    w: D, d: W, plinth: { h: 0.35, out: 0.04, bucket: 'stone' }, storeys: sts, roof: canal(19 + rng() * 5, 0.32), gableBucket: wall, openings,
    chimneys: [{ x: -D * 0.22, z: (rng() < 0.5 ? -1 : 1) * (W / 2 - 0.9), sx: 0.6, sz: 0.7, above: 0.8, bucket: 'plaster', cap: 'tile' },
      ...(W > 9 && rng() < 0.6 ? [{ x: -D * 0.1, z: 0, sx: 0.55, sz: 0.55, above: 0.7, bucket: 'plaster' as RegionalBucket, cap: 'tile' as const }] : [])],
    gutters: null, verge: null, spall: null, reveal: 0.26,
  };
  const impost = rng() < 0.55, dado = st.band !== null || rng() < 0.4, pots = look() < 0.6, lantern = look() < 0.5;
  const span = W - 2.2 + 1.6;
  const lst: AndalusianState = long ? { ...st, longBalcony: { face: 'right', storey: 1, u0: -span / 2, u1: span / 2 } } : st;
  sink.placed(0, fit.cx, 0, fit.cz, () => streetwise(sink, () => {
    const frame = buildHouse(sink, spec, dialect(lst, look));
    alero(sink, frame);
    const bandBucket = st.band ?? 'plaster3';
    if (dado) zocalo(sink, frame, bandBucket, 0.9);
    if (impost) band(sink, frame, 1, frame.floors[1] - 0.1, 0.2, 0.05, bandBucket);
    // the portada round the street door: pilasters and an entablature of dressed stone
    const f = frame.faces.right, door = openings.find((o) => o.face === 'right' && o.storey === 0 && o.kind === 'door')!;
    const pw = 0.32, top = door.h + 0.42;
    for (const s of [-1, 1]) faceBox(sink, 'stone', f, door.u + s * (door.w / 2 + 0.22 + pw / 2), frame.floors[0] + top / 2, 0.06, pw, top, 0.12, { decor: true, fineSides: true });
    faceBox(sink, 'stone', f, door.u, frame.floors[0] + top + 0.12, 0.09, door.w + 0.44 + 2 * pw + 0.2, 0.24, 0.18, { decor: true, shadow: true });
    if (cierroBay >= 0) cierro(sink, f, bayU(cierroBay), frame.floors[1] + 0.55, 1.1, 1.7, 0.55, st.joinery);
    else if (long) balcony(sink, f, bayU(1), frame.floors[1], span, 0.55, look, st.mobile);
    sink.dressing(st.mobile, () => {
      if (pots) {
        const spans = openings.filter((o) => o.face === 'right' && o.storey === 0).map((o) => [o.u - o.w / 2 - 0.35, o.u + o.w / 2 + 0.35] as const);
        wallPots(sink, f, -W / 2 + 0.45, W / 2 - 0.45, frame.floors[1] - 0.6, look, [...spans, [door.u - door.w / 2 - 0.9, door.u + door.w / 2 + 0.9]]);
      }
      if (lantern) wallLantern(sink, f, door.u + (door.w / 2 + 0.8) * (door.u > 0 ? -1 : 1), 3.0);
    });
  }));
  return sink.finish();
}

/**
 * A glazed cierro over an upper window: a timber box with glass on three sides, its foot a moulded slab, a cornice and
 * a little cap over it, an iron grille across its lower lights.
 */
function cierro(sink: PartSink, face: Face, u: number, y: number, w: number, h: number, depth: number, joinery: Rgb): void {
  const W = w + 0.34, base = y - 0.3, top = y + h + 0.22;
  const dec = { decor: true, shadow: true } as const;
  faceBox(sink, 'plaster', face, u, base - 0.09, depth / 2 + 0.02, W + 0.14, 0.18, depth + 0.04, dec);
  faceBox(sink, 'plaster', face, u, top + 0.07, depth / 2 + 0.03, W + 0.18, 0.14, depth + 0.06, dec);
  const jc = { colour: joinery, decor: true } as const;
  for (const s of [-1, 1]) faceBox(sink, 'structureWood', face, u + s * (W / 2 - 0.03), (base + top) / 2, depth - 0.03, 0.06, top - base, 0.06, jc);
  faceBox(sink, 'structureWood', face, u, base + 0.04, depth - 0.03, W, 0.08, 0.06, jc, 'ends');
  faceBox(sink, 'structureWood', face, u, top - 0.04, depth - 0.03, W, 0.08, 0.06, jc, 'ends');
  faceBox(sink, 'glass', face, u, (base + top) / 2, depth - 0.045, W - 0.08, top - base - 0.12, 0.01, { decor: true });
  for (const s of [-1, 1]) faceBox(sink, 'glass', face, u + s * (W / 2 - 0.01), (base + top) / 2, depth / 2, 0.01, top - base - 0.12, depth - 0.1, { decor: true });
  const fine = { colour: joinery, decor: true, fine: true } as const;
  for (const t of [0.42, 0.72]) faceBox(sink, 'structureWood', face, u, base + (top - base) * t, depth - 0.02, W - 0.06, 0.035, 0.03, fine, 'ends');
  for (const k of [-1, 0, 1]) faceBox(sink, 'structureWood', face, u + k * W / 3, (base + top) / 2, depth - 0.02, 0.035, top - base - 0.16, 0.03, fine, 'caps');
  const iron = { colour: IRON, decor: true, fine: true } as const;
  for (let k = 1; k < 9; k++) faceBox(sink, 'structureMetal', face, u - W / 2 + W * k / 9, base + 0.35, depth + 0.01, 0.018, 0.5, 0.018, iron, 'caps');
}

/**
 * The posada (inn) on the road: two storeys under a hipped roof, the arched cart gateway (portón) to the inn yard in
 * its dressed stone voussoirs, the tavern door beside it under its board, a long iron balcony across the main floor,
 * rejas below, a vine trained on a trellis over the door, a stone trough by the gate.
 */
const posada: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const rng = st.rng, look = ctx.variant;
  const fit = wallsIn(ctx, 0.36, 0.36);
  const W = clamp(fit.w, 7.5, 11.5), D = clamp(fit.d, 10, 16.5);
  sink.placed(0, fit.cx, 0, fit.cz, () => {
    const gateSide = rng() < 0.5 ? -1 : 1;
    const gw = 2.6, gu = gateSide * (W / 2 - 0.9 - gw / 2), du = -gateSide * (W / 2 - 1.9);
    const openings: Opening[] = [
      { face: 'front', storey: 0, kind: 'gate', u: gu, w: gw, y0: 0, h: 3.1 },
      { face: 'front', storey: 0, kind: 'door', u: du, w: 1.3, y0: 0, h: 2.5 },
    ];
    const mid = (gu + du) / 2;
    if (Math.abs(gu - du) > 4.2) openings.push({ face: 'front', storey: 0, kind: 'window', u: mid, w: 0.95, y0: 1.0, h: 1.4 });
    for (const u of [gu, du, ...(W > 9 ? [mid] : [])]) openings.push({ face: 'front', storey: 1, kind: 'door', u, w: 0.95, y0: 0, h: 2.2 });
    for (const face of ['right', 'left'] as const) {
      for (const o of windowRhythm(face, 0, D, { w: 0.9, h: 1.3, sill: 1.0, spacing: 2.6, margin: 1.2 })) openings.push(o);
      for (const o of windowRhythm(face, 1, D, { w: 0.85, h: 1.15, sill: 0.8, spacing: 2.6, margin: 1.2 })) openings.push(o);
    }
    for (const o of windowRhythm('back', 1, W, { w: 0.8, h: 1.1, sill: 0.85, spacing: 2.4, margin: 1.2 })) openings.push(o);
    openings.push({ face: 'back', storey: 0, kind: 'door', u: 0, w: 1.1, y0: 0, h: 2.2 });
    const span = Math.abs(gu - du) + 1.6, centre = (gu + du) / 2;
    const lst: AndalusianState = { ...st, longBalcony: { face: 'front', storey: 1, u0: centre - span / 2, u1: centre + span / 2 } };
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.3, out: 0.04, bucket: 'stone' }, storeys: [{ h: 3.5, wall: 'plaster' }, { h: 2.9, wall: 'plaster' }],
      roof: canal(21 + rng() * 3, 0.32, 0.32, 'hip'), openings,
      chimneys: [{ x: W * 0.22, z: -D * 0.25, sx: 0.7, sz: 0.7, above: 0.8, bucket: 'plaster', cap: 'tile' },
        { x: -W * 0.2, z: D * 0.15, sx: 0.55, sz: 0.55, above: 0.7, bucket: 'plaster', cap: 'tile' }],
      gutters: null, verge: null, spall: null, reveal: 0.28,
    }, dialect(lst, look));
    alero(sink, frame);
    zocalo(sink, frame, st.band ?? 'plaster3', 0.85);
    // the gateway's voussoirs round its arch and the keystone
    const f = frame.faces.front;
    for (let k = 0; k <= 8; k++) {
      const a = Math.PI * k / 8;
      faceBox(sink, 'stone', f, gu + Math.cos(a) * (gw / 2 + 0.16), frame.floors[0] + 3.1 + Math.sin(a) * 0.62, 0.05, 0.36, 0.32, 0.1, { decor: true });
    }
    // a long balcony across the main floor
    balcony(sink, f, centre, frame.floors[1], span, 0.6, look, st.mobile);
    // the board over the tavern door
    faceBox(sink, 'structureWood', f, du, frame.floors[0] + 2.95, 0.04, 1.3, 0.42, 0.05, { colour: rgb(0x3a2a1e), decor: true });
    faceBox(sink, 'structureWood', f, du, frame.floors[0] + 2.95, 0.07, 1.1, 0.26, 0.01, { colour: rgb(0xc8a050), decor: true });
    sink.dressing(st.mobile, () => {
      // the vine over the tavern door: a trellis of poles on two posts and the leaves in loose clumps
      const timber = rgb(0x6a5440), leaf = rgb(0x4f6a34);
      for (const s of [-1, 1]) faceBox(sink, 'structureWood', f, du + s * 1.1, frame.floors[0] + 1.25, 1.55, 0.1, 2.5, 0.1, { colour: timber, decor: true });
      for (const s of [-1, 1]) faceBox(sink, 'structureWood', f, du + s * 1.1, frame.floors[0] + 2.55, 0.8, 0.08, 0.08, 1.6, { colour: timber, decor: true });
      for (let k = 0; k < 14; k++) {
        faceBox(sink, 'structureWood', f, du + (look() - 0.5) * 2.4, frame.floors[0] + 2.6 + look() * 0.25, 0.2 + look() * 1.3,
          0.4 + look() * 0.4, 0.22 + look() * 0.2, 0.35 + look() * 0.3, { colour: shade(leaf, 0.75 + look() * 0.45), decor: true, shadow: true });
      }
      faceBox(sink, 'stone', f, gu + (gw / 2 + 1.0) * -gateSide, frame.floors[0] + 0.3, 0.45, 1.5, 0.55, 0.6, { decor: true, shadow: true });
      wallLantern(sink, f, du + 0.9 * gateSide, 2.6);
    });
  });
  return sink.finish();
};

// ------------------------------------------------------------------------------------------------ the town's monuments

/**
 * The casa consistorial on the square: two storeys and a hipped tile roof, the main floor carried forward over the
 * square on an arcade of stone piers and round arches (soportales), a balcony at every bay above it and the main
 * balcony in the middle under a stone surround, quoins, a string course and a cornice; over the middle bay the clock
 * and bell gable (espadaña) with its clock face, its bell in an arch, a pediment and an iron cross.
 */
const ayuntamiento: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const look = ctx.variant;
  // the plot's long side is the square: the grammar's ridge along it (streetwise), the arcade on the street front
  // the building fills the base hall's measured box: its back wall at the box's back, the arcade's piers a metre inside
  // its front (the old colonnade's line), its ends at the box's ends
  const bb = ctx.bounds, arcade = 4.6;
  const L = clamp(bb.maxX - bb.minX - 0.4, 18, 33), back = bb.minZ + 0.35, body = clamp(bb.maxZ - 1.0 - back - arcade, 10, 18);
  const xc = (bb.minX + bb.maxX) / 2;
  const bays = Math.max(5, Math.round(L / 3.8) | 1);
  const bay = L / bays;
  const g0 = 4.4, g1 = 4.0, plinth = 0.45;
  const openings: Opening[] = [];
  for (let k = 0; k < bays; k++) {
    const u = -L / 2 + (k + 0.5) * bay;
    const centre = k === (bays - 1) / 2;
    openings.push(centre ? { face: 'right', storey: 0, kind: 'door', u, w: 1.8, y0: 0, h: 3.1 }
      : { face: 'right', storey: 0, kind: k % 2 ? 'door' : 'window', u, w: k % 2 ? 1.2 : 1.1, y0: k % 2 ? 0 : 0.9, h: k % 2 ? 2.6 : 1.6 });
    openings.push({ face: 'right', storey: 1, kind: 'door', u, w: centre ? 1.4 : 1.05, y0: 0, h: centre ? 2.7 : 2.45 });
  }
  for (const face of ['front', 'back'] as const) for (const i of [0, 1]) {
    for (const o of windowRhythm(face, i, body + (i ? arcade : 0), { w: 1.0, h: i ? 1.6 : 1.4, sill: i ? 0.7 : 1.0, spacing: 4.2, margin: 1.8, max: 2 })) openings.push(o);
  }
  for (const i of [0, 1]) for (const o of windowRhythm('left', i, L, { w: 1.0, h: i ? 1.6 : 1.35, sill: i ? 0.7 : 1.1, spacing: 5.0, margin: 2.2 })) openings.push(o);
  const cx = back + body / 2;
  sink.placed(0, xc, 0, 0, () => streetwise(sink, () => sink.placed(0, cx, 0, 0, () => {
    const frame = buildHouse(sink, {
      w: body, d: L, plinth: { h: plinth, out: 0.06, bucket: 'stone' },
      storeys: [{ h: g0, wall: 'plaster' }, { h: g1, wall: 'plaster', jetty: [0, arcade, 0, 0] }],
      roof: canal(20, 0.42, 0.42, 'hip'), openings, gutters: null, verge: null, spall: null, reveal: 0.32,
      chimneys: [{ x: -body * 0.25, z: -L * 0.3, sx: 0.7, sz: 0.7, above: 0.8, bucket: 'plaster', cap: 'tile' },
        { x: -body * 0.25, z: L * 0.3, sx: 0.7, sz: 0.7, above: 0.8, bucket: 'plaster', cap: 'tile' }],
    }, dialect({ ...st, reja: null, band: 'plaster2', window: { ...st.window, shutters: null, surround: { bucket: 'stone', width: 0.16, out: 0.03, lintel: 0.22 } } }, look));
    const eaveY = frame.eaveY, top = frame.bodies[1], floorY = frame.floors[1];
    // the arcade: stone piers on the square's line, round arches between them, a stone architrave under the main floor
    const front: Face = { origin: [top.x1, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: L };
    for (let k = 0; k <= bays; k++) {
      const p = k === 0 || k === bays ? 0.38 : 0.3;
      const uu = clamp(-L / 2 + k * bay, -L / 2 + p, L / 2 - p);
      sink.span('stone', top.x1 - 0.62, -0.4, -uu - p, top.x1, floorY, -uu + p);
      faceBox(sink, 'stone', front, uu, 0.3, 0.04, 2 * p + 0.12, 0.6, 0.08, { decor: true });
      faceBox(sink, 'stone', front, uu, floorY - 1.1, 0.04, 2 * p + 0.1, 0.16, 0.08, { decor: true });
    }
    for (let k = 0; k < bays; k++) {
      const u0 = -L / 2 + k * bay + 0.3, u1 = -L / 2 + (k + 1) * bay - 0.3, r = (u1 - u0) / 2;
      archFill(sink, front, (u0 + u1) / 2, r, floorY - 1.0 - r * 0.92, r * 0.92, floorY, 0.5, 'plaster', 'stone', true, 6);
    }
    sink.span('stone', top.x1 - 0.55, floorY - 0.22, -L / 2, top.x1 + 0.06, floorY + 0.05, L / 2, { decor: true });
    // quoins and the cornice
    for (const [qx, qz] of [[top.x0, top.z0], [top.x1, top.z0], [top.x0, top.z1], [top.x1, top.z1]] as const) {
      const sx = qx > 0 ? 1 : -1, sz = qz > 0 ? 1 : -1;
      for (let y = floorY + 0.2, k = 0; y < eaveY - 0.5; y += 0.75, k++) {
        const lx = k % 2 ? 0.7 : 0.4, lz = k % 2 ? 0.4 : 0.7;
        sink.quoin('stone', qx - sx * lx, y, qz - sz * lz, qx + sx * 0.03, y + 0.68, qz + sz * 0.03, sx, sz, { decor: true });
      }
    }
    sink.band('stone', top.x0 - 0.12, eaveY - 0.3, top.z0 - 0.12, top.x1 + 0.12, eaveY, top.z1 + 0.12, { decor: true, shadow: true });
    band(sink, frame, 1, floorY + 0.12, 0.22, 0.06, 'stone');
    // the main balcony's stone surround over the middle door
    faceBox(sink, 'stone', front, 0, floorY + 2.95, 0.08, 2.4, 0.3, 0.16, { decor: true, shadow: true });
    for (const s of [-1, 1]) faceBox(sink, 'stone', front, s * 1.0, floorY + 1.4, 0.05, 0.22, 2.8, 0.1, { decor: true });
    // the clock and bell gable over the middle bay, standing on the front wall's head: the clock on its lower block
    const gw = 4.4;
    espadana(sink, front, eaveY + 1.9, gw * 0.62, 0.5, 0.3, st.mobile);
    wallPolygon(sink, 'plaster', front, [[-gw / 2, eaveY - 0.3], [gw / 2, eaveY - 0.3], [gw / 2, eaveY + 1.9], [-gw / 2, eaveY + 1.9]], 0.5);
    sink.band('stone', top.x1 - 0.5, eaveY + 1.9, -gw / 2 - 0.08, top.x1 + 0.1, eaveY + 2.1, gw / 2 + 0.08, { decor: true, shadow: true });
    // (round 3, gauntlet wave 108c: "no visible clock face" from the square: the dial 1.1 m across read as a dot at 60 m;
    // now 1.6 m in a stone ring, its hours marked, its hands long)
    const clockC = facePoint(front, 0, eaveY + 0.8, 0.0);
    sink.cylinder('stone', clockC, 'x', 0.1, 0.94, 20, { decor: true });
    sink.cylinder('structureMetal', [clockC[0] + 0.1, clockC[1], clockC[2]], 'x', 0.02, 0.8, 20, { colour: rgb(0xece6d6), decor: true });
    for (let h = 0; h < 12; h++) {
      const a = (h / 12) * Math.PI * 2, r = 0.68, len = h % 3 === 0 ? 0.16 : 0.09;
      const cy = clockC[1] + Math.cos(a) * r, cz = clockC[2] + Math.sin(a) * r;
      sink.span('structureMetal', clockC[0] + 0.12, cy - 0.025, cz - 0.025, clockC[0] + 0.13, cy + 0.025, cz + 0.025,
        { colour: IRON, decor: true });
      if (len > 0.1) sink.span('structureMetal', clockC[0] + 0.12, cy - 0.04, cz - 0.04, clockC[0] + 0.13, cy + 0.04, cz + 0.04, { colour: IRON, decor: true });
    }
    sink.span('structureMetal', clockC[0] + 0.12, clockC[1] - 0.03, clockC[2] - 0.03, clockC[0] + 0.15, clockC[1] + 0.6, clockC[2] + 0.03, { colour: IRON, decor: true });
    sink.span('structureMetal', clockC[0] + 0.12, clockC[1] - 0.03, clockC[2] - 0.03, clockC[0] + 0.15, clockC[1] + 0.03, clockC[2] + 0.42, { colour: IRON, decor: true });
  })));
  return sink.finish();
};

/**
 * The parish church: a nave of dressed stone with buttresses down its sides and a cornice, small high windows, a
 * Renaissance side portal, the lower square chancel under a hipped roof at the head; the belfry tower over the west
 * door at the street end — the shaft of ashlar, the bell stage's round arches with their bells, the cornice with its
 * corner pinnacles, the tiled spire and the cross.
 */
const iglesia: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const look = ctx.variant;
  const W = clamp(ctx.info.w - 1.6, 6.5, 9.0);
  const tower = 4.2;
  const zFront = ctx.info.d / 2 + 0.3;
  const zt0 = zFront - tower;
  const chancel = 3.4, nave = clamp(ctx.info.d - tower - chancel - 0.6, 9, 16);
  const nz1 = zt0 + 0.4, nz0 = nz1 - nave;
  const naveH = 8.6;
  const openings: Opening[] = [];
  for (const face of ['right', 'left'] as const) {
    for (const o of windowRhythm(face, 0, nave, { w: 0.75, h: 1.7, sill: 5.6, spacing: 3.6, margin: 2.2, max: 3 })) openings.push(o);
  }
  openings.push({ face: 'right', storey: 0, kind: 'door', u: 0, w: 1.6, y0: 0, h: 3.0 });
  const plain: HouseDialect = {
    window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, {
      frame: rgb(0x3a3430), frameWidth: 0.05, frameOut: 0.03, bars: 'none', surround: { bucket: 'stone', width: 0.2, out: 0.06, lintel: 0.24 },
      sill: { bucket: 'stone', out: 0.1 }, shutters: null,
    }, st.rng, 0.25),
    door: (s, face, o, y0) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, {
      leaf: rgb(0x4a3322), frame: { bucket: 'stone', width: 0.3, out: 0.12, arch: true }, steps: { bucket: 'stone' }, leafKind: 'plank',
    }, y0 + o.y0),
  };
  sink.placed(0, 0, 0, (nz0 + nz1) / 2, () => {
    const frame = buildHouse(sink, {
      w: W, d: nave, plinth: { h: 0.4, out: 0.08, bucket: 'stone' }, storeys: [{ h: naveH, wall: 'stone' }],
      roof: canal(26, 0.3, 0.12), gableBucket: 'stone', openings, chimneys: [], gutters: null, verge: null, spall: null, reveal: 0.45,
    }, plain);
    sink.band('stone', -W / 2 - 0.16, frame.eaveY - 0.32, -nave / 2 - 0.05, W / 2 + 0.16, frame.eaveY, nave / 2 + 0.05, { decor: true, shadow: true });
    // the buttresses: three down each side, stepped back twice
    for (const side of [-1, 1]) for (const t of [-0.36, 0, 0.36]) {
      const z = t * nave;
      if (side > 0 && Math.abs(z) < 1.6) continue;
      const x = side * W / 2;
      sink.span('stone', x - (side > 0 ? 0.02 : 0), -0.4, z - 0.45, x + side * 1.0, 3.2, z + 0.45);
      sink.span('stone', x - (side > 0 ? 0.02 : 0), 3.2, z - 0.42, x + side * 0.7, 5.6, z + 0.42);
      sink.span('stone', x - (side > 0 ? 0.02 : 0), 5.6, z - 0.38, x + side * 0.4, 7.6, z + 0.38);
    }
    // the side portal: pilasters, an entablature, a pediment with a niche
    const f = frame.faces.right;
    for (const s of [-1, 1]) faceBox(sink, 'stone', f, s * 1.35, 2.0, 0.14, 0.34, 3.6, 0.28, { decor: true });
    faceBox(sink, 'stone', f, 0, 3.95, 0.18, 3.2, 0.4, 0.36, { decor: true, shadow: true });
    for (const s of [-1, 1]) sink.member('stone', facePoint(f, s * 1.6, 4.2, 0.18), facePoint(f, 0, 5.0, 0.18), 0.22, 0.3, f.out, { decor: true, exposed: true }, 0);
    faceBox(sink, 'dark', f, 0, 4.55, 0.02, 0.5, 0.45, 0.02, { decor: true });
  });
  // the chancel: lower, hipped, at least square; it runs back to the plot's end (0.35 m short of it: the solid within
  // half a metre of the base's reach, regionalArchitecture's footprint coverage)
  const cw = W - 1.6, cLen = Math.max(chancel, nz0 + ctx.info.d / 2 - 0.35);
  sink.placed(0, 0, 0, nz0 - cLen / 2 + 0.2, () => {
    buildHouse(sink, {
      w: cw, d: cLen + 0.4, plinth: { h: 0.4, out: 0.08, bucket: 'stone' }, storeys: [{ h: naveH - 1.4, wall: 'stone' }],
      roof: canal(24, 0.25, 0.25, 'hip'), gableBucket: 'stone', openings: [{ face: 'back', storey: 0, kind: 'window', u: 0, w: 0.6, h: 1.2, y0: 4.2 }],
      chimneys: [], gutters: null, verge: null, spall: null, reveal: 0.4,
    }, plain);
  });
  // the tower over the west door
  const tz = zt0 + tower / 2, shaft = 13.4, stage = 4.0, half = tower / 2;
  sink.span('stone', -half - 0.12, -0.4, tz - half - 0.12, half + 0.12, 0.6, tz + half + 0.12);
  sink.span('stone', -half, 0.6, tz - half, half, shaft, tz + half);
  const tf: Face = { origin: [0, 0, tz + half], u: [1, 0, 0], out: [0, 0, 1], width: tower };
  doorUnit(sink, tf, 0, 0.6, 1.5, 2.9, { leaf: rgb(0x4a3322), frame: { bucket: 'stone', width: 0.32, out: 0.14, arch: true }, steps: { bucket: 'stone' }, leafKind: 'plank' }, 0.6);
  faceBox(sink, 'dark', tf, 0, 5.4, 0.01, 0.62, 1.1, 0.02, { decor: true });
  faceBox(sink, 'stone', tf, 0, 6.05, 0.08, 0.95, 0.16, 0.16, { decor: true });
  faceBox(sink, 'stone', tf, 0, 4.75, 0.07, 0.95, 0.12, 0.14, { decor: true });
  // cornices at the shaft's head and the stage's
  sink.band('stone', -half - 0.18, shaft - 0.05, tz - half - 0.18, half + 0.18, shaft + 0.3, tz + half + 0.18, { decor: true, shadow: true });
  // the bell stage: four corner piers, a round arch on each face with its bell
  const p = 0.62, y0 = shaft + 0.3, y1 = y0 + stage;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    sink.span('stone', sx > 0 ? half - p : -half, y0, tz + (sz > 0 ? half - p : -half), sx > 0 ? half : -half + p, y1, tz + (sz > 0 ? half : -half + p));
  }
  sink.span('stone', -half, y1 - 0.75, tz - half, half, y1, tz + half);
  sink.span('stone', -half, y0, tz - half, half, y0 + 0.5, tz + half);
  const faces: Face[] = [
    { origin: [0, 0, tz + half], u: [1, 0, 0], out: [0, 0, 1], width: tower },
    { origin: [0, 0, tz - half], u: [-1, 0, 0], out: [0, 0, -1], width: tower },
    { origin: [half, 0, tz], u: [0, 0, -1], out: [1, 0, 0], width: tower },
    { origin: [-half, 0, tz], u: [0, 0, 1], out: [-1, 0, 0], width: tower },
  ];
  const open = tower - 2 * p;
  for (const fc of faces) {
    archFill(sink, fc, 0, open / 2, y1 - 0.9 - open / 2 * 0.85, open / 2 * 0.85, y1 - 0.75, 0.45, 'stone', 'stone', true, 8, true);
    sink.cylinder('structureMetal', facePoint(fc, 0, y0 + 0.9, -p * 0.7), 'y', 1.0, 0.42, 10, { colour: BELL, decor: true }, 0.22);
  }
  sink.band('stone', -half - 0.2, y1, tz - half - 0.2, half + 0.2, y1 + 0.32, tz + half + 0.2, { decor: true, shadow: true });
  // the corner pinnacles (a stork's nest on one corner's cornice instead, on most towers), the tiled spire and its cross
  // (the corner is drawn on every tier, so a phone's tower keeps the same solid pinnacles: only the nest is dressing)
  const nestDraw = look(), nestSide = look();
  const nest = nestDraw < 0.6 ? (nestSide < 0.5 ? 0 : 1) : -1;
  ([[-1, 1], [1, 1], [-1, -1], [1, -1]] as const).forEach(([sx, sz], k) => {
    const px = sx * (half - 0.05), pz = tz + sz * (half - 0.05);
    if (k === nest) {
      if (!st.mobile) sink.cylinder('structureWood', [px - sx * 0.25, y1 + 0.3, pz - sz * 0.25], 'y', 0.42, 0.62, 8, { colour: rgb(0x5a4a36), decor: true, shadow: true }, 0.7);
      return;
    }
    sink.span('stone', px - 0.18, y1 + 0.32, pz - 0.18, px + 0.18, y1 + 0.7, pz + 0.18);
    sink.cylinder('stone', [px, y1 + 0.7, pz], 'y', 0.9, 0.16, 6, {}, 0.02);
  });
  const spire: RoofSpec = { kind: 'hip', pitchDeg: 52, eave: 0.12, verge: 0.12, thickness: 0.1, bucket: 'roof', ridge: null };
  sink.placed(0, 0, 0, tz, () => emitRoof(sink, roofGeometry(tower - 0.5, tower - 0.5, y1 + 0.32, spire), spire));
  const tip = y1 + 0.32 + (tower - 0.5) / 2 * Math.tan(52 * Math.PI / 180);
  sink.span('structureMetal', -0.035, tip - 0.1, tz - 0.035, 0.035, tip + 1.4, tz + 0.035, { colour: IRON, decor: true });
  sink.span('structureMetal', -0.3, tip + 0.95, tz - 0.035, 0.3, tip + 1.02, tz + 0.035, { colour: IRON, decor: true });
  return sink.finish();
};

/**
 * The wall tower by the bridgehead: a Nasrid tower of the old town walls — rubble with ashlar quoins on a battered
 * foot, a horseshoe window in its frame (alfiz), a moulded band, and the parapet of pointed merlons (almenas).
 */
const torre: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const S = clamp(Math.min(ctx.info.w, ctx.info.d) - 0.3, 3.0, 4.2), h = S / 2;
  const H = 9.2 + rng() * 1.2;
  // the battered foot and the shaft
  sink.span('stone', -h - 0.35, -0.5, -h - 0.35, h + 0.35, 0.4, h + 0.35);
  sink.span('stone', -h - 0.2, 0.4, -h - 0.2, h + 0.2, 2.2, h + 0.2);
  sink.span('stone', -h, 2.2, -h, h, H, h);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    for (let y = 2.3, k = 0; y < H - 0.6; y += 0.5, k++) {
      const lx = k % 2 ? 0.55 : 0.3, lz = k % 2 ? 0.3 : 0.55;
      sink.quoin('stone', sx * h - sx * lx, y, sz * h - sz * lz, sx * h + sx * 0.03, y + 0.44, sz * h + sz * 0.03, sx, sz, { decor: true });
    }
  }
  const front: Face = { origin: [0, 0, h], u: [1, 0, 0], out: [0, 0, 1], width: S };
  // the small door at the foot and the horseshoe window in its frame
  faceBox(sink, 'dark', front, 0, 1.1, 0.21, 0.9, 1.7, 0.02, { decor: true });
  faceBox(sink, 'stone', front, 0, 2.05, 0.28, 1.25, 0.24, 0.16, { decor: true });
  const wy = H * 0.6;
  faceBox(sink, 'dark', front, 0, wy, 0.01, 0.62, 1.15, 0.02, { decor: true });
  for (let k = 0; k <= 8; k++) {
    const a = -0.35 + (Math.PI + 0.7) * k / 8;
    faceBox(sink, 'stone', front, Math.cos(a) * 0.38, wy + 0.45 + Math.sin(a) * 0.4, 0.03, 0.14, 0.14, 0.06, { decor: true });
  }
  for (const s of [-1, 1]) faceBox(sink, 'stone', front, s * 0.62, wy + 0.3, 0.03, 0.1, 1.9, 0.06, { decor: true });
  faceBox(sink, 'stone', front, 0, wy + 1.25, 0.03, 1.34, 0.1, 0.06, { decor: true });
  // the band and the parapet walk's merlons with their pyramidal caps
  sink.band('stone', -h - 0.1, H - 0.3, -h - 0.1, h + 0.1, H, h + 0.1, { decor: true, shadow: true });
  const m = 0.55, step = S / 3;
  for (const side of [0, 1, 2, 3]) {
    for (let k = 0; k < 3; k++) {
      const t = -h + step * (k + 0.5);
      const [mx, mz] = side === 0 ? [t, h - 0.2] : side === 1 ? [h - 0.2, -t] : side === 2 ? [-t, -h + 0.2] : [-h + 0.2, t];
      // a merlon is m along its wall and 0.4 through it
      const cw = side % 2 ? 0.4 : m, cd = side % 2 ? m : 0.4;
      sink.span('stone', mx - cw / 2, H, mz - cd / 2, mx + cw / 2, H + 0.85, mz + cd / 2);
      const cap: RoofSpec = { kind: 'hip', pitchDeg: 48, eave: 0, verge: 0, thickness: 0.05, bucket: 'stone', ridge: null, decor: true };
      sink.placed(0, mx, 0, mz, () => emitRoof(sink, roofGeometry(cw, cd, H + 0.85, cap), cap));
    }
  }
  return sink.finish();
};

/**
 * The hermitage (ermita): a single white nave under a tile roof, the arched door in an ochre band under a small round
 * window, a porch on two white pillars before it, and the bell gable over the front gable — a stepped wall with one
 * arched opening and its bell, a little pediment and an iron cross.
 */
const ermita: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const look = ctx.variant;
  const fit = wallsIn(ctx, 0.3, 0.08);
  const W = clamp(fit.w, 4.4, 6.6), porch = 1.4;
  const D = clamp(fit.d - porch, 5.6, 9.5);
  sink.placed(0, fit.cx, 0, fit.cz, () => {
    const H = 4.4;
    const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: 0, w: 1.3, y0: 0, h: 2.5 },
      { face: 'right', storey: 0, kind: 'window', u: D * 0.12, w: 0.55, h: 0.9, y0: 2.2 },
      { face: 'left', storey: 0, kind: 'window', u: -D * 0.12, w: 0.55, h: 0.9, y0: 2.2 }];
    const zc = -porch / 2;
    sink.placed(0, 0, 0, zc, () => {
      const frame = buildHouse(sink, {
        w: W, d: D, plinth: { h: 0.3, out: 0.05, bucket: 'stone' }, storeys: [{ h: H, wall: 'plaster' }],
        roof: canal(24, 0.25, 0.08), gableBucket: 'plaster', openings, chimneys: [], gutters: null, verge: null, spall: null, reveal: 0.35,
      }, { ...dialect({ ...st, band: 'plaster2', reja: 'flat' }, look),
        door: (s, face, o, y0) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, {
          leaf: rgb(0x4a3322), frame: { bucket: 'plaster2', width: 0.26, out: 0.02, arch: true }, steps: { bucket: 'stone' }, leafKind: 'plank',
        }, y0 + o.y0) });
      alero(sink, frame);
      zocalo(sink, frame, 'plaster2', 0.7);
      const f = frame.faces.front;
      // the round window over the door
      sink.cylinder('plaster2', facePoint(f, 0, H + 0.75, 0.0), 'z', 0.012, 0.45, 12, { decor: true });
      sink.cylinder('dark', facePoint(f, 0, H + 0.75, 0.0), 'z', 0.022, 0.31, 12, { decor: true });
      // the bell gable on the front gable's apex. Round 3 (gauntlet wave 108c: "its bell gable has no bell opening"):
      // its opening stood level with the roof's ridge, so the tiles closed it from every side; the gable now rises
      // clear of the ridge, the bell hanging in the sky
      const ridge = frame.roof.ridgeTopY;
      espadana(sink, { origin: [0, 0, D / 2], u: [1, 0, 0], out: [0, 0, 1], width: 2.2 }, ridge - 0.15, 2.2, 0.32, 0.27, st.mobile);
    });
    // the porch: two white pillars and a lean-to of tiles from the front wall
    const fz = zc + D / 2, pz = fz + porch;
    for (const s of [-1, 1]) sink.span('plaster', s * 1.15 - 0.2, -0.3, pz - 0.4, s * 1.15 + 0.2, 2.9, pz);
    const lean: RoofSpec = { kind: 'shed', pitchDeg: 16, eave: 0.12, verge: 0.18, thickness: 0.1, bucket: 'roof' };
    sink.placed(-Math.PI / 2, 0, 0, fz + porch / 2, () => emitRoof(sink, roofGeometry(porch + 0.05, 2.9, 2.9, lean), lean));
    sink.span('stone', -1.5, -0.3, fz, 1.5, 0.12, pz + 0.1, { decor: true });
  });
  return sink.finish();
};

/**
 * The flour mill on the gorge floor, ruined (the molinos below the Puente Nuevo): rubble walls standing to broken
 * heads, the arched race (cárcavo) under the downstream wall where the water left the wheel, the stone channel of the
 * race running out of it, a millstone lying in the rubble.
 */
const molino: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  // the shell fills the base ruin's measured box, the race channel running out of its front
  const bb = ctx.bounds;
  const W = clamp(bb.maxX - bb.minX - 0.1, 5.0, 7.4), D = clamp(bb.maxZ - bb.minZ - 1.7, 6.0, 9.0);
  const t = 0.6, H1 = 4.2;
  const zc = bb.minZ + 0.05 + D / 2, xc = (bb.minX + bb.maxX) / 2;
  sink.placed(0, xc, 0, 0, () => {
  const faces: Array<{ face: Face; gable: boolean; race: boolean }> = [
    { face: { origin: [0, 0, zc + D / 2], u: [1, 0, 0], out: [0, 0, 1], width: W }, gable: true, race: true },
    { face: { origin: [0, 0, zc - D / 2], u: [-1, 0, 0], out: [0, 0, -1], width: W }, gable: true, race: false },
    { face: { origin: [W / 2, 0, zc], u: [0, 0, -1], out: [1, 0, 0], width: D - 2 * t }, gable: false, race: false },
    { face: { origin: [-W / 2, 0, zc], u: [0, 0, 1], out: [-1, 0, 0], width: D - 2 * t }, gable: false, race: false },
  ];
  for (const { face, gable, race } of faces) {
    const L = face.width, n = 8;
    const tops: number[] = [];
    for (let k = 0; k <= n; k++) {
      const u = -L / 2 + L * k / n, mid = Math.abs(u) / (L / 2);
      let hh = H1 * (0.5 + rng() * 0.45);
      if (gable && rng() < 0.6) hh = Math.max(hh, H1 + (1 - mid) * W * 0.16 * (0.5 + rng() * 0.5));
      tops.push(hh);
    }
    if (!race && rng() < 0.55) { const k = 1 + Math.floor(rng() * (n - 2)); tops[k] = 0.7 + rng() * 0.6; tops[k + 1] = Math.min(tops[k + 1], 1.5 + rng()); }
    const jamb = 0.95;
    for (let k = 0; k < n; k++) {
      let a = -L / 2 + L * k / n, b = -L / 2 + L * (k + 1) / n, ta = tops[k], tb = tops[k + 1];
      if (race) {
        // the race's arch: the strips stop at its jambs, the head wall below stands over it
        if (a >= -jamb && b <= jamb) continue;
        if (a < -jamb && b > -jamb) { tb = ta + (tb - ta) * (-jamb - a) / (b - a); b = -jamb; }
        else if (a < jamb && b > jamb) { ta = ta + (tb - ta) * (jamb - a) / (b - a); a = jamb; }
      }
      wallPolygon(sink, 'stone', face, [[a, -0.3], [b, -0.3], [b, tb], [a, ta]], t);
    }
    if (race) {
      const head = clamp(tops[n / 2], 2.4, 3.2);
      wallPolygon(sink, 'stone', face, [[-jamb, 1.75], [jamb, 1.75], [jamb, head], [-jamb, head]], t);
      archFill(sink, face, 0, jamb, 1.05, 0.68, 1.75, t, 'stone', 'stone', false);
      // the wheel chamber's darkness behind the arch, closed on every side (the shell is open to the sky above it)
      const c = facePoint(face, 0, 0.7, -t + 0.06);
      sink.box('dark', c, [jamb, 0.75, 0.05], { decor: true }, new LocalFrame(face.u, [0, 1, 0], face.out, c));
    }
    if (!gable) {
      for (const u of [-L * 0.22, L * 0.22]) {
        const k = Math.min(n - 1, Math.max(0, Math.floor((u + L / 2) / (L / n))));
        if (Math.min(tops[k], tops[k + 1]) < 3.4) continue;
        // a window hole through the wall, seen from both sides (the shell is open to the sky): every face of its void
        sink.box('dark', facePoint(face, u, 2.6, -t / 2), [0.275, 0.4, t / 2 + 0.01], { decor: true },
          new LocalFrame(face.u, [0, 1, 0], face.out, facePoint(face, u, 2.6, -t / 2)));
      }
    }
  }
  // the race's channel out of the arch, its stone sides
  const rz0 = zc + D / 2, rz1 = Math.min(bb.maxZ + 0.1, rz0 + 2.0);
  for (const s of [-1, 1]) sink.span('stone', s * 0.95 - 0.25, -0.3, rz0, s * 0.95 + 0.25, 0.35, rz1);
  // the rubble heap and a millstone in it
  sink.span('stone', -W * 0.28, -0.2, zc - D * 0.22, W * 0.26, 0.85, zc + D * 0.12, { decor: true });
  sink.cylinder('stone', [W * 0.08, 0.6, zc - D * 0.06], 'y', 0.32, 0.72, 14, { decor: true, shadow: true });
  });
  return sink.finish();
};

/**
 * The school (escuelas): two storeys of limewash on a stone plinth under a hipped roof, a symmetric front with the
 * door under a stone pediment and a plaque, tall grilled windows down the classroom sides, ochre bands at the corners
 * and the floor line (the regionalist schools of the 1920s).
 */
const escuela: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const look = ctx.variant;
  const fit = wallsIn(ctx, 0.44, 0.44);
  const W = clamp(fit.w, 7.5, 10.5), D = clamp(fit.d, 11, 17);
  sink.placed(0, fit.cx, 0, fit.cz, () => {
    const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: 0, w: 1.6, y0: 0, h: 2.8 }];
    for (const o of windowRhythm('front', 0, W, { w: 1.1, h: 1.8, sill: 0.9, spacing: 2.6, margin: 1.1, avoid: [[-1.1, 1.1]] })) openings.push(o);
    for (const o of windowRhythm('front', 1, W, { w: 1.1, h: 1.7, sill: 0.8, spacing: 2.4, margin: 1.1, avoid: [[-1.3, 1.3]] })) openings.push(o);
    for (const face of ['right', 'left'] as const) for (const i of [0, 1]) {
      for (const o of windowRhythm(face, i, D, { w: 1.15, h: i ? 1.8 : 1.9, sill: i ? 0.8 : 0.9, spacing: 2.5, margin: 1.2 })) openings.push(o);
    }
    for (const o of windowRhythm('back', 0, W, { w: 1.0, h: 1.4, sill: 1.1, spacing: 2.6, margin: 1.2 })) openings.push(o);
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.55, out: 0.06, bucket: 'stone' }, storeys: [{ h: 3.9, wall: 'plaster' }, { h: 3.6, wall: 'plaster' }],
      roof: canal(22, 0.38, 0.38, 'hip'), openings, gutters: null, verge: null, spall: null, reveal: 0.3,
      chimneys: [{ x: W * 0.2, z: -D * 0.28, sx: 0.6, sz: 0.6, above: 0.8, bucket: 'plaster', cap: 'tile' }],
    }, dialect({ ...st, band: 'plaster2', reja: 'flat', window: { ...st.window, surround: { bucket: 'plaster2', width: 0.18, out: 0.02, lintel: 0.24 } } }, look));
    alero(sink, frame);
    band(sink, frame, 1, frame.floors[1] - 0.05, 0.24, 0.05, 'plaster2');
    const b0 = frame.bodies[0];
    for (const [cx, cz] of [[b0.x0, b0.z0], [b0.x1, b0.z0], [b0.x0, b0.z1], [b0.x1, b0.z1]] as const) {
      const sx = cx > 0 ? 1 : -1, sz = cz > 0 ? 1 : -1;
      sink.quoin('plaster2', cx - sx * 0.45, 0.55, cz - sz * 0.45, cx + sx * 0.02, frame.eaveY - 0.05, cz + sz * 0.02, sx, sz, { decor: true });
    }
    const f = frame.faces.front;
    // the stone pediment over the door, the plaque under it
    faceBox(sink, 'stone', f, 0, 3.75, 0.1, 2.5, 0.26, 0.2, { decor: true, shadow: true });
    for (const s of [-1, 1]) sink.member('stone', facePoint(f, s * 1.25, 3.88, 0.1), facePoint(f, 0, 4.45, 0.1), 0.2, 0.2, f.out, { decor: true, exposed: true }, 0);
    faceBox(sink, 'stone', f, 0, frame.floors[1] + 1.7, 0.03, 2.3, 0.62, 0.06, { decor: true, shadow: true });
    faceBox(sink, 'dark', f, 0, frame.floors[1] + 1.7, 0.065, 1.95, 0.22, 0.01, { decor: true });
  });
  return sink.finish();
};

// ------------------------------------------------------------------------------------------------ the country

/**
 * The cortijo round its patio: the two-storey house along one side (its door to the lane and its door to the patio),
 * the stable wing (cuadras) along the other under a lean-to of tiles, the patio walls between them, the arched gateway
 * in the front wall with a tile coping and a bell on its gable; a well in the patio, prickly pear by the walls.
 */
const cortijo: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const rng = st.rng, look = ctx.variant;
  // the farmstead fills the base farmhouse's measured box: the house's eave at its -x side, the stable wing's at its +x
  const bb = ctx.bounds, hd = (bb.maxZ - bb.minZ) / 2, zc = (bb.minZ + bb.maxZ) / 2;
  const x0 = bb.minX + 0.36, x1 = bb.maxX - 0.27;
  const D = clamp(bb.maxZ - bb.minZ - 0.24, 7.5, 11.5);
  sink.placed(0, 0, 0, zc, () => {
  const hwide = clamp((x1 - x0) * 0.4, 5.6, 6.8);
  const hx = x0 + hwide / 2;
  // the house
  const openings: Opening[] = [
    { face: 'left', storey: 0, kind: 'door', u: D * 0.1, w: 1.3, y0: 0, h: 2.4 },
    { face: 'right', storey: 0, kind: 'door', u: -D * 0.15, w: 1.1, y0: 0, h: 2.2 },
  ];
  for (const o of windowRhythm('left', 0, D, { w: 0.85, h: 1.15, sill: 0.95, spacing: 2.4, margin: 1.0, avoid: [[D * 0.1 - 0.7, D * 0.1 + 0.7]] })) openings.push(o);
  for (const face of ['left', 'right'] as const) for (const o of windowRhythm(face, 1, D, { w: 0.8, h: 1.0, sill: 0.8, spacing: 2.4, margin: 1.0, max: 3 })) openings.push(o);
  for (const o of windowRhythm('front', 1, hwide, { w: 0.7, h: 0.9, sill: 0.9, spacing: 2.4, margin: 1.4, max: 1 })) openings.push(o);
  sink.placed(0, hx, 0, 0, () => {
    const frame = buildHouse(sink, {
      w: hwide, d: D, plinth: { h: 0.25, out: 0.04, bucket: 'stone' }, storeys: [{ h: 2.9, wall: 'plaster' }, { h: 2.5, wall: 'plaster' }],
      roof: canal(21 + rng() * 4, 0.3), gableBucket: 'plaster', openings,
      chimneys: [{ x: -hwide * 0.22, z: (rng() < 0.5 ? -1 : 1) * (D / 2 - 0.8), sx: 0.65, sz: 0.65, above: 0.8, bucket: 'plaster', cap: 'tile' }],
      gutters: null, verge: null, spall: null, reveal: 0.26,
    }, dialect({ ...st, reja: st.reja ?? 'box' }, look));
    alero(sink, frame);
    if (st.band) zocalo(sink, frame, st.band, 0.8);
    if (look() < 0.6) sink.dressing(st.mobile, () => wallPots(sink, frame.faces.left, -D / 2 + 0.6, D / 2 - 0.6, 2.35, look));
  });
  // the stable wing along the far side, under a lean-to falling outward: its walls a prism under the slope
  const sw = clamp((x1 - x0) * 0.24, 2.8, 3.6), sx0 = x1 - sw;
  const pitch = 13, low = 2.3, rise = sw * Math.tan(pitch * Math.PI / 180);
  const wingEnd: Face = { origin: [(sx0 + x1) / 2, 0, D / 2], u: [1, 0, 0], out: [0, 0, 1], width: sw };
  wallPolygon(sink, 'plaster', wingEnd, [[-sw / 2, -0.3], [sw / 2, -0.3], [sw / 2, low], [-sw / 2, low + rise]], D);
  const wingFace: Face = { origin: [sx0, 0, 0], u: [0, 0, 1], out: [-1, 0, 0], width: D };
  for (const u of [-D * 0.28, D * 0.08, D * 0.36]) {
    doorUnit(sink, wingFace, u, 0, 1.2, 1.9, { leaf: shade(st.door, 0.85), frame: { bucket: 'plaster2', width: 0.14, out: 0.015 }, steps: null, leafKind: 'plank' });
  }
  const lean: RoofSpec = { kind: 'shed', pitchDeg: pitch, eave: 0.25, verge: 0.12, thickness: 0.12, bucket: 'roof' };
  sink.placed(0, (sx0 + x1) / 2, 0, 0, () => emitRoof(sink, roofGeometry(sw, D, low, lean), lean));
  // the patio walls between the house and the wing, the arched gateway in the front wall under its bell gable
  const px0 = x0 + hwide, wallTop = 2.3, gateW = clamp(sx0 - px0 - 1.7, 2.0, 2.8), gc = (px0 + sx0) / 2;
  const pier = (gateW / 2 + 0.35);
  const back0 = -D / 2 - 0.22, back1 = -D / 2 + 0.22;
  sink.span('plaster', px0, -0.3, back0, sx0, wallTop, back1);
  sink.span('roof', px0, wallTop, back0 - 0.08, sx0, wallTop + 0.12, back1 + 0.08, { decor: true });
  const zz0 = D / 2 - 0.22, zz1 = D / 2 + 0.22;
  sink.span('plaster', px0, -0.3, zz0, gc - pier, wallTop, zz1);
  sink.span('plaster', gc + pier, -0.3, zz0, sx0, wallTop, zz1);
  for (const [a, b] of [[px0, gc - pier], [gc + pier, sx0]] as const) sink.span('roof', a, wallTop, zz0 - 0.08, b, wallTop + 0.12, zz1 + 0.08, { decor: true });
  for (const sgn of [-1, 1]) sink.span('plaster', gc + sgn * pier - 0.35, -0.3, zz0 - 0.08, gc + sgn * pier + 0.35, 3.3, zz1 + 0.08);
  const gf: Face = { origin: [gc, 0, zz1 + 0.08], u: [1, 0, 0], out: [0, 0, 1], width: 2 * pier + 0.7 };
  const gd = zz1 - zz0 + 0.16;
  archFill(sink, gf, 0, gateW / 2, 2.45, 0.5, 3.3, gd, 'plaster', 'plaster2', false);
  wallPolygon(sink, 'plaster', gf, [[-pier - 0.35, 3.3], [pier + 0.35, 3.3], [pier + 0.35, 3.75], [-pier - 0.35, 3.75]], gd);
  espadana(sink, gf, 3.75, 1.5, 0.4, 0.17, st.mobile, false);
  gateUnit(sink, gf, 0, 0, gateW, 2.45, st.door, { bucket: 'plaster2', width: 0.12, out: 0.015 });
  // the patio's well: a whitewashed curb, an iron arch and its pulley
  const wx = gc, wz = -D * 0.1;
  sink.cylinder('plaster', [wx, -0.2, wz], 'y', 1.05, 0.62, 10, {}, 0.62);
  sink.dressing(st.mobile, () => {
    for (const s of [-1, 1]) sink.span('structureMetal', wx + s * 0.55 - 0.02, 0.85, wz - 0.02, wx + s * 0.55 + 0.02, 2.0, wz + 0.02, { colour: IRON, decor: true });
    sink.span('structureMetal', wx - 0.57, 1.98, wz - 0.02, wx + 0.57, 2.02, wz + 0.02, { colour: IRON, decor: true });
    sink.cylinder('structureMetal', [wx, 1.85, wz - 0.03], 'z', 0.06, 0.12, 8, { colour: IRON, decor: true });
    // prickly pear against the outer walls
    if (look() < 0.8) chumbera(sink, x0 + 1.2, -hd - 0.4, 1.05 + look() * 0.3, look);
    if (look() < 0.6) chumbera(sink, x1 - 0.8, -hd - 0.3, 0.9 + look() * 0.3, look);
  });
  });
  return sink.finish();
};

/**
 * The barn (pajar): a long whitewashed rubble barn on a stone plinth under a low tile roof, the round-arched cart door
 * in the front gable with its stone voussoirs, the hay loft's door above it under a hoist beam, small vents high in the
 * sides, corner buttresses.
 */
const pajar: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const look = ctx.variant;
  const fit = wallsIn(ctx, 0.3, 0.1);
  const W = clamp(fit.w, 6.0, 9.5), D = clamp(fit.d, 9, 14.5);
  sink.placed(0, fit.cx, 0, fit.cz, () => {
    const openings: Opening[] = [
      { face: 'front', storey: 0, kind: 'gate', u: 0, w: 2.8, y0: 0, h: 2.9 },
      { face: 'front', storey: 0, kind: 'loft', u: 0, w: 0.9, y0: 3.4, h: 0.75 },
      { face: 'back', storey: 0, kind: 'door', u: W * 0.2, w: 1.1, y0: 0, h: 2.1 },
    ];
    for (const face of ['right', 'left'] as const) {
      for (const o of windowRhythm(face, 0, D, { w: 0.3, h: 0.55, sill: 3.0, spacing: 2.2, margin: 1.4, kind: 'loft' })) openings.push(o);
    }
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.4, out: 0.05, bucket: 'stone' }, storeys: [{ h: 4.3, wall: 'plaster' }],
      roof: canal(20, 0.3), gableBucket: 'plaster', openings, chimneys: [], gutters: null, verge: null, spall: null, reveal: 0.35,
    }, dialect({ ...st, litShare: 0, reja: null }, look));
    alero(sink, frame);
    const f = frame.faces.front;
    for (let k = 0; k <= 8; k++) {
      const a = Math.PI * k / 8;
      faceBox(sink, 'stone', f, Math.cos(a) * 1.58, frame.floors[0] + 2.9 + Math.sin(a) * 0.5, 0.05, 0.36, 0.32, 0.1, { decor: true });
    }
    faceBox(sink, 'structureWood', f, 0, frame.floors[0] + 4.55, 0.55, 0.16, 0.18, 1.1, { colour: rgb(0x5a4632), decor: true, uv: UV_MEMBER });
    // corner buttresses
    for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const x = cx * W / 2, z = cz * D / 2;
      sink.span('plaster', x - (cx > 0 ? 0.02 : 0.3), -0.3, z - (cz > 0 ? 0.02 : 0.45), x + (cx > 0 ? 0.3 : 0.02), 2.4, z + (cz > 0 ? 0.45 : 0.02));
    }
    if (look() < 0.55) sink.dressing(st.mobile, () => chumbera(sink, -W / 2 - 0.2, -D / 2 - 0.9, 1.0 + look() * 0.3, look));
  });
  return sink.finish();
};

/**
 * The dovecote (palomar): a square whitewashed tower under a lean-to of tiles, its pigeon holes in rows under the
 * eaves above a projecting ledge, a low store against its front with its own door.
 */
const palomar: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const look = ctx.variant;
  // the dovecote at the back of the base granary's measured box, its store reaching the box's front
  const bb = ctx.bounds;
  const S = clamp(Math.min(bb.maxX - bb.minX - 0.5, 3.8), 3.0, 3.8), half = S / 2;
  const tz = bb.minZ + 0.25 + half, H = 5.8, xc = (bb.minX + bb.maxX) / 2;
  sink.placed(0, xc, 0, 0, () => {
  sink.span('stone', -half - 0.05, -0.4, tz - half - 0.05, half + 0.05, 0.4, tz + half + 0.05);
  sink.span('plaster', -half, 0.4, tz - half, half, H, tz + half);
  // the tower's low pyramid of tiles
  const cap: RoofSpec = { kind: 'hip', pitchDeg: 24, eave: 0.25, verge: 0.25, thickness: 0.12, bucket: 'roof', ridge: 'round' };
  sink.placed(0, 0, 0, tz, () => emitRoof(sink, roofGeometry(S, S, H, cap), cap));
  const faces: Face[] = [
    { origin: [0, 0, tz + half], u: [1, 0, 0], out: [0, 0, 1], width: S },
    { origin: [half, 0, tz], u: [0, 0, -1], out: [1, 0, 0], width: S },
    { origin: [-half, 0, tz], u: [0, 0, 1], out: [-1, 0, 0], width: S },
  ];
  for (const fc of faces) {
    faceBox(sink, 'plaster', fc, 0, 4.25, 0.1, S + 0.1, 0.12, 0.2, { decor: true, shadow: true });
    for (let r = 0; r < 3; r++) for (let k = 0; k < 5; k++) {
      if ((r + k) % 2) continue;
      faceBox(sink, 'dark', fc, -S / 2 + 0.4 + k * (S - 0.8) / 4, 4.55 + r * 0.32, 0.005, 0.12, 0.14, 0.01, { decor: true });
    }
  }
  // the store in front, its own lean-to falling toward the plot's front
  const s0 = tz + half, s1 = bb.maxZ - 0.22;
  if (s1 - s0 > 1.2) {
    // its walls a prism under the lean-to's slope, high against the tower
    const L = s1 - s0 + 0.02, rise = (s1 - s0) * Math.tan(14 * Math.PI / 180);
    const side: Face = { origin: [-half + 0.1, 0, (s0 - 0.02 + s1) / 2], u: [0, 0, 1], out: [-1, 0, 0], width: L };
    wallPolygon(sink, 'plaster', side, [[-L / 2, -0.3], [L / 2, -0.3], [L / 2, 2.3], [-L / 2, 2.3 + rise]], S - 0.2);
    const sl: RoofSpec = { kind: 'shed', pitchDeg: 14, eave: 0.2, verge: 0.1, thickness: 0.1, bucket: 'roof' };
    sink.placed(-Math.PI / 2, 0, 0, (s0 + s1) / 2, () => emitRoof(sink, roofGeometry(s1 - s0, S - 0.2, 2.3, sl), sl));
    const sf: Face = { origin: [0, 0, s1], u: [1, 0, 0], out: [0, 0, 1], width: S - 0.2 };
    doorUnit(sink, sf, 0, 0, 0.95, 1.85, { leaf: st.door, frame: { bucket: 'plaster2', width: 0.12, out: 0.015 }, steps: null, leafKind: 'plank' });
  }
  if (look() < 0.5) sink.dressing(st.mobile, () => chumbera(sink, half + 0.6, tz, 0.9, look));
  });
  return sink.finish();
};

/**
 * The bread oven in the yard (horno de leña): a whitewashed block under a whitewashed dome, its arched mouth with a
 * stone lip, a little flue; firewood stacked against its side under a lean-to of tiles on two posts (the yard's
 * outbuilding). The oven stands at the plot's -x end as deep as the plot; the firewood rack fills the rest.
 */
const horno: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const look = ctx.variant;
  const b = ctx.bounds, W = b.maxX - b.minX, D = b.maxZ - b.minZ, cz = (b.minZ + b.maxZ) / 2;
  const B = clamp(Math.min(D - 0.1, W - 0.65), 1.8, 2.6), h = B / 2;
  const ox = b.minX + 0.05 + h;
  sink.span('stone', ox - h - 0.04, -0.4, cz - h - 0.04, ox + h + 0.04, 0.3, cz + h + 0.04);
  sink.span('plaster', ox - h, 0.3, cz - h, ox + h, 1.05, cz + h);
  sink.cylinder('plaster', [ox, 1.05, cz], 'y', 0.2, h * 0.98, 12, {}, h * 0.95);
  // the dome: stacked frustums swelling in and closing
  let y = 1.25, r = h * 0.95;
  for (const k of [0.92, 0.78, 0.56, 0.28]) {
    const nr = h * k, dh = 0.24;
    sink.cylinder('plaster', [ox, y, cz], 'y', dh, r, 12, {}, nr);
    y += dh; r = nr;
  }
  sink.span('plaster', ox - 0.16, y - 0.2, cz - 0.16, ox + 0.16, y + 0.35, cz + 0.16);
  const f: Face = { origin: [ox, 0, cz + h], u: [1, 0, 0], out: [0, 0, 1], width: B };
  faceBox(sink, 'dark', f, 0, 0.72, 0.006, 0.55, 0.42, 0.01, { decor: true });
  faceBox(sink, 'stone', f, 0, 0.47, 0.12, 0.85, 0.08, 0.24, { decor: true });
  // the firewood rack: two posts on the plot's +x side and a lean-to of tiles falling to them from the oven, as long as
  // the plot is deep (0.3 m short of its ends: the solid within half a metre of the base's reach, regionalArchitecture's
  // footprint coverage); past the oven's sides two more posts carry the lean-to's head
  const x0 = ox + h + 0.04, x1 = b.maxX - 0.02, sw = x1 - x0, rz = Math.max(h - 0.06, D / 2 - 0.3);
  if (sw > 0.35) {
    for (const s of [-1, 1]) sink.span('wood', x1 - 0.1, 0, cz + s * rz - 0.05, x1, 1.2, cz + s * rz + 0.05);
    if (rz > h + 0.1) for (const s of [-1, 1]) sink.span('wood', x0, 0, cz + s * rz - 0.05, x0 + 0.1, 1.2 + sw * Math.tan(14 * Math.PI / 180), cz + s * rz + 0.05);
    const lean: RoofSpec = { kind: 'shed', pitchDeg: 14, eave: 0.1, verge: 0.1, thickness: 0.08, bucket: 'roof' };
    sink.placed(0, (x0 + x1) / 2, 0, cz, () => emitRoof(sink, roofGeometry(sw, 2 * rz, 1.2, lean), lean));
    sink.dressing(ctx.tier === 'mobile', () => {
      // the stack against the oven's side only (it has no back where the rack runs on past the oven)
      const side: Face = { origin: [x0, 0, cz], u: [0, 0, -1], out: [1, 0, 0], width: 2 * rz };
      woodpile(sink, side, -(h - 0.06) + 0.1, h - 0.06 - 0.1, 0.9 + look() * 0.2, look);
    });
  }
  return sink.finish();
};

export const ANDALUSIAN_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  cottage: (ctx) => casa(ctx),
  rowhouse: (ctx) => townhouse(ctx),
  cornershop: (ctx) => townhouse(ctx, { shop: true }),
  tavern: posada,
  civichall: ayuntamiento,
  church: iglesia,
  tower: torre,
  chapel: ermita,
  ruin: molino,
  schoolhouse: escuela,
  farmhouse: cortijo,
  barn: pajar,
  granary: palomar,
  woodshed: horno,
});

/**
 * whitewash (cal): a warm brilliant white over the render's own relief (the photo render set stays off). The canvas's
 * relief at a third of its contrast (the pair of 2026-10-05: at full contrast the limewash read as coarse popcorn
 * stucco from 15 m), the same mean.
 */
const cal = (_h: number, s: number, l: number): readonly [number, number, number] => [0.1, Math.min(1, s * 0.16), Math.min(1, l * 0.42 + 0.6)];

export const ANDALUSIAN_STYLE: ArchitectureStyle = Object.freeze<ArchitectureStyle>({
  id: 'andalusian',
  region: 'Serranía de Ronda, Málaga: limewashed white towns under canal tiles, rejas and iron balconies, cortijos round their patios',
  surfaces: {
    // teja árabe: curved clay tiles in channels and caps, orange-brown, lichened
    roof: { kind: 'canal', tint: [0.74, 0.45, 0.3] },
    // the gorge's golden calcarenite (the Puente Nuevo's stone)
    stone: { kind: 'sandstone', tint: [0.82, 0.73, 0.57] },
    sourced: { plaster: false, wood: true },
    tones: {
      plaster: cal,
      // albero ochre: the bands round the openings, the dados, a few washed fronts
      plaster2: (_h, s, l) => [0.105, Math.min(1, 0.36 + s * 0.3), Math.min(1, l * 0.4 + 0.33)],
      // the grey of the dados and a few bands
      plaster3: (_h, s, l) => [0.11, Math.min(1, 0.05 + s * 0.15), Math.min(1, l * 0.32 + 0.255)],
    },
    // round 2 (gauntlet wave 108b: "limewash is popcorn stucco at several times real scale"): coat on coat of lime over
    // the render, a fine shallow skin — the tile at 1 m instead of 2.4 m, its relief at under half strength. Round 3
    // (108c: "a flat, regular weave-like pattern that reads as synthetic fabric"): the metre tile's repeat read as a
    // weave, so the tile is 1.3 m and its relief a fifth
    relief: { plasterUv: 1.8, normal: 0.22, ao: 0.32 },
  },
  builders: ANDALUSIAN_BUILDERS,
  // limewash renewed every spring, sun-bleached tiles lichened yellow-grey, a dry inland climate
  weather: {
    plaster: [[1, 1, 1], [1, 0.985, 0.96], [0.97, 0.965, 0.955], [1.0, 0.97, 0.93]],
    stone: [[1, 1, 1], [0.95, 0.93, 0.88], [1.04, 1.0, 0.93], [0.9, 0.88, 0.84]],
    roof: [[1, 1, 1], [0.9, 0.83, 0.76], [1.06, 0.95, 0.86], [0.84, 0.79, 0.74]],
    damp: 0.35, moss: 0.3, mossTint: [0.97, 0.93, 0.74],
  },
  wear: 0.18,
  // the yards: stone garden walls round a kitchen garden and the bread oven, a gate (yards.ts)
  yard: { kinds: ['cottage', 'farmhouse'], fence: 'wallstone', gate: 'gate', shed: 'woodshed', shedSize: [3.2, 2.8], garden: true },
});
