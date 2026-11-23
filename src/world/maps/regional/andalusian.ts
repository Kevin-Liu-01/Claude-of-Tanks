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
  LocalFrame, PartSink, faceBox, facePanel, facePoint, normalize3, pick, rgb, shade, UV_MEMBER,
  type EmitOptions, type Face, type RegionalBucket, type RegionalParts, type Rgb, type Vec3,
} from './geometry.ts';
import {
  buildHouse, emitRoof, holedBox, recordShaft, roofCrown, roofGeometry, storeyFaces, wallPolygon, windowRhythm,
  type HouseDialect, type HouseFrame, type HouseSpec, type Opening, type RoofSpec, type StoreySpec,
} from './house.ts';
import { doorUnit, freeBox, gateUnit, windowUnit, type WindowStyle } from './openings.ts';
import { wallLantern } from './dressing.ts';
import { finialOn } from './domes.ts';
import { archGlazing, archHead } from './sarajevoParts.ts';
import { coursedRound, openShed, recordMasonry } from './outbuildings.ts';
import { dressOf, type ArchitectureStyle, type RegionalBuildContext, type RegionalBuilder } from './types.ts';

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
  /** (dome-detail-275) the balconies' balusters as flat irons (a great front's budget: balcony `flat`) */
  flatRails?: boolean;
}

/** (buildings-270) the dress the Serranía's photos show house to house (the building-style table's cliffbridge axes) */
const JOINERY_DRESS: Readonly<Record<string, Rgb>> = { green: rgb(0x2e4a32), brown: rgb(0x4c3c33), white: rgb(0xe8e6e0) };
const BAND_DRESS: Readonly<Record<string, RegionalBucket | null>> = { ochre: 'plaster2', grey: 'plaster3', none: null };

function stateFor(ctx: RegionalBuildContext): AndalusianState {
  const rng = ctx.rng;
  // (buildings-270) the draws stay (the build stream reads as before); the map's dress paints the joinery and the bands
  const drawnJoinery = pick(rng, JOINERY);
  const joinery = JOINERY_DRESS[dressOf(ctx, 'joinery', '')] ?? drawnJoinery;
  const bandRoll = rng();
  const drawnBand: RegionalBucket | null = bandRoll < 0.45 ? 'plaster2' : bandRoll < 0.7 ? 'plaster3' : null;
  const bandDress = dressOf(ctx, 'band', '');
  const band: RegionalBucket | null = bandDress in BAND_DRESS ? BAND_DRESS[bandDress] : drawnBand;
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
function balcony(sink: PartSink, face: Face, u: number, floorY: number, w: number, depth: number, look: () => number, mobile: boolean, flat = false): void {
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
  const m = Math.max(2, Math.round(d / 0.13));
  if (flat) {
    // (dome-detail-275) each baluster a flat iron facing out of the balcony, rail to rail
    const b0 = floorY + 0.13, b1 = top - 0.02, bw = 0.011;
    for (let k = 1; k < n; k++) {
      const bu = u - w / 2 + w * k / n;
      facing(sink, 'structureMetal', [facePoint(face, bu - bw, b0, d), facePoint(face, bu + bw, b0, d), facePoint(face, bu + bw, b1, d), facePoint(face, bu - bw, b1, d)], face.out, fine);
    }
    for (const s of [-1, 1]) for (let k = 1; k < m; k++) {
      const bu = u + s * (w / 2 - 0.02), bo = d * k / m, side: Vec3 = [face.u[0] * s, 0, face.u[2] * s];
      facing(sink, 'structureMetal', [facePoint(face, bu, b0, bo - bw), facePoint(face, bu, b0, bo + bw), facePoint(face, bu, b1, bo + bw), facePoint(face, bu, b1, bo - bw)], side, fine);
    }
  } else {
    for (let k = 1; k < n; k++) faceBox(sink, 'structureMetal', face, u - w / 2 + w * k / n, floorY + 0.55, d, 0.018, 0.84, 0.018, fine, 'caps');
    for (const s of [-1, 1]) for (let k = 1; k < m; k++) faceBox(sink, 'structureMetal', face, u + s * (w / 2 - 0.02), floorY + 0.55, d * k / m, 0.018, 0.84, 0.018, fine, 'caps');
  }
  // (a great front's flat-railed balconies carry no pots: the budget, dome-detail-275)
  if (look() < 0.7 && !flat) sink.dressing(mobile, () => {
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
function espadana(sink: PartSink, face: Face, y0: number, w: number, depth: number, bell: number, cross = true, dressed = false): void {
  const ow = bell * 2.3, oh = bell * 3.0, base = y0 + 0.5, head = base + oh;
  wallPolygon(sink, 'plaster', face, [[-w / 2, y0], [w / 2, y0], [w / 2, base], [-w / 2, base]], depth);
  wallPolygon(sink, 'plaster', face, [[-w / 2, base], [-ow / 2, base], [-ow / 2, head], [-w / 2, head]], depth);
  wallPolygon(sink, 'plaster', face, [[ow / 2, base], [w / 2, base], [w / 2, head], [ow / 2, head]], depth);
  archFill(sink, face, 0, ow / 2, head - ow / 2 * 0.8 - 0.05, ow / 2 * 0.8, head, depth, 'plaster', null, false);
  const top = head + 0.32;
  wallPolygon(sink, 'plaster', face, [[-w / 2, head], [w / 2, head], [w / 2, top], [-w / 2, top]], depth);
  wallPolygon(sink, 'plaster', face, [[-w / 2 - 0.08, top], [w / 2 + 0.08, top], [0, top + w * 0.32]], depth);
  const mid = facePoint(face, 0, 0, -depth / 2);
  if (dressed) {
    // (dome-detail-275) the dressed gable: its stone base course and the cornice under the pediment, both a hand proud
    // either side; the imposts at the arch's springing; the bell turned on its oak yoke (campana); a stone ball at each
    // shoulder of the pediment
    const dc = { decor: true, shadow: true } as const, sp = head - ow / 2 * 0.8 - 0.05;
    faceBox(sink, 'stone', face, 0, base - 0.06, -depth / 2, w + 0.12, 0.12, depth + 0.12, dc);
    faceBox(sink, 'stone', face, 0, top - 0.05, -depth / 2, w + 0.16, 0.1, depth + 0.12, dc);
    for (const e of [-1, 1]) faceBox(sink, 'stone', face, e * (ow / 2 + 0.06), sp - 0.05, -depth / 2, 0.14, 0.1, depth + 0.06, { decor: true });
    const axle = sp - 0.02;
    campana(sink, face, 0, axle, -depth / 2, bell);
    faceBox(sink, 'structureMetal', face, 0, axle, -depth / 2, ow + 0.1, 0.06, 0.06, { colour: IRON, decor: true }, 'ends');
    for (const e of [-1, 1]) sink.revolve('stone', facePoint(face, e * (w / 2 - 0.06), top, -depth / 2), 'y', [[0, 0.09], [0.08, 0.05], [0.2, 0.1], [0.32, 0]], 8, { decor: true });
  } else {
    sink.cylinder('structureMetal', [mid[0], base + oh * 0.28, mid[2]], 'y', bell * 1.05, bell, 10, { colour: BELL, decor: true }, bell * 0.5);
    // the bar it hangs from, across the opening (259, the phone census: a phone's build left it out, the bell in the air)
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
  // (props census r2 sweep, Lane C 2026-10-16: the mat hung 7 cm off the wall on nothing — six floating blinds on a
  // posada, a dark plate laid over the window's surround) it hangs as the real ones do, from an iron rod carried clear
  // of the surround and the sill's nose on two brackets driven into the wall over the lintel, the mat let down from
  // the rod and rolled at its foot
  const off = 0.14, iron = { colour: IRON, decor: true } as const;
  for (const s of [-1, 1]) faceBox(sink, 'structureMetal', face, u + s * (w / 2 + 0.05), top + 0.02, off / 2, 0.03, 0.03, off + 0.02, iron);
  faceBox(sink, 'structureMetal', face, u, top + 0.02, off, w + 0.2, 0.025, 0.025, iron);
  faceBox(sink, 'structureWood', face, u, (top + 0.02 + bottom) / 2, off, w + 0.16, top + 0.02 - bottom, 0.016, opts);
  faceBox(sink, 'structureWood', face, u, bottom + 0.045, off + 0.015, w + 0.18, 0.09, 0.08, opts);
}

/**
 * The plank shutters (postigos) of a window (u, y: its bottom-centre): two leaves, each three boards side by side with
 * their joints open a centimetre and two ledges across them, folded back flat on the wall either side of the surround,
 * or now and then closed across the opening. (Props census r2 sweep, Lane C 2026-10-16: openings.ts laid each leaf as
 * one board, six of the school's read as dark plates painted on the white walls.) Its draws are windowUnit's for its
 * shutters, in their order: the leaves' fade, then whether they stand closed.
 */
function postigos(sink: PartSink, face: Face, u: number, y: number, w: number, h: number, style: WindowStyle, rng: () => number): void {
  const sh = style.shutters!, leaf = w / 2 + 0.03, sideOff = style.surround ? style.surround.width : 0;
  const fade = 0.88 + rng() * 0.2;
  const closed = rng() < (sh.closed ?? 0);
  const sc = { colour: [sh.colour[0] * fade, sh.colour[1] * fade, sh.colour[2] * fade] as Rgb, decor: true, uv: UV_MEMBER };
  const T = 0.035, boards = 3, joint = 0.012, lh = h + 0.02;
  const leafAt = (cu: number, o: number, ledges: boolean) => {
    for (let k = 0; k < boards; k++) {
      faceBox(sink, 'structureWood', face, cu - leaf / 2 + (k + 0.5) * leaf / boards, y + h / 2, o, leaf / boards - joint, lh, T, { ...sc, fineSides: true });
    }
    if (ledges) for (const t of [0.18, 0.82]) faceBox(sink, 'structureWood', face, cu, y + h * t, o + T / 2 + 0.008, leaf - 0.04, 0.07, 0.02, { ...sc, fine: true }, { back: true, ends: true });
  };
  if (closed) {
    // both leaves across the opening, proud of the frame, their ledges inside
    const shut = Math.max(0, style.frameOut - sink.recess);
    leafAt(u - leaf / 2 + 0.015, shut + 0.025, false);
    leafAt(u + leaf / 2 - 0.015, shut + 0.028, false);
    return;
  }
  // folded back flat on the wall (their back faces then never show), the ledged inner faces out
  for (const side of [-1, 1]) leafAt(u + side * (w / 2 + sideOff + leaf / 2 + 0.02), T / 2 + 0.001, true);
}

function dialect(st: AndalusianState, look: () => number): HouseDialect {
  return {
    window: (sink, face, o, y0) => {
      const loft = o.kind === 'loft';
      // (the shutters' two draws are windowUnit's last on the stream: the leaves drawn after it draw them in its place)
      windowUnit(sink, face, o.u, y0 + o.y0, o.w, o.h, loft ? { ...st.window, shutters: null, bars: 'none', surround: null } : { ...st.window, shutters: null },
        st.rng, loft ? 0 : st.litShare);
      if (!loft && st.window.shutters) postigos(sink, face, o.u, y0 + o.y0, o.w, o.h, st.window, st.rng);
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
        if (!(lb && lb.face === o.face && lb.storey === o.storey && o.u >= lb.u0 && o.u <= lb.u1)) balcony(sink, face, o.u, y0 + o.y0, o.w + 0.55, 0.5, look, st.mobile, st.flatRails);
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
  // (buildings-270, the census: whole fronts in albero ochre read as mustard boxes; the Serranía's photos whitewash the
  // walls and paint only the dados and the bands) a washed front is the rare house
  const wall: RegionalBucket = ctx.wallBucket === 'plaster2' && look() < 0.12 ? 'plaster2' : 'plaster';
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
    // (dome-detail-275, the roof sweep) the canal tiles in relief, as the barn and the chapel lay them
    canalTiles(sink, frame, look);
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
    // (dome-detail-275, the roof sweep) the canal tiles in relief
    canalTiles(sink, frame, look);
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
      // (props census r2 sweep, Lane C 2026-10-16: the leaves between the two poles hung in the air) the laths nailed
      // across the poles that carry the vine, and every clump of leaves bedded on them (its draws as before, in order)
      const lathTop = frame.floors[0] + 2.63;
      for (let o = 0.12; o < 1.6; o += 0.29) faceBox(sink, 'structureWood', f, du, lathTop - 0.02, o, 2.36, 0.04, 0.05, { colour: shade(timber, 1.1), decor: true });
      for (let k = 0; k < 14; k++) {
        const lu = look(), ly = look(), lo = look(), lw = look(), lh = look(), ld = look(), tone = look();
        const sy = 0.22 + lh * 0.2;
        faceBox(sink, 'structureWood', f, du + (lu - 0.5) * 2.4, lathTop - 0.03 + ly * 0.04 + sy / 2, 0.2 + lo * 1.3,
          0.4 + lw * 0.4, sy, 0.35 + ld * 0.3, { colour: shade(leaf, 0.75 + tone * 0.45), decor: true, shadow: true });
      }
      // the trough on the street against the wall's foot (the connectivity sweep: it stood at the ground floor's level,
      // a third of a metre over the street)
      faceBox(sink, 'stone', f, gu + (gw / 2 + 1.0) * -gateSide, 0.24, 0.36, 1.5, 0.62, 0.6, { decor: true, shadow: true });
      wallLantern(sink, f, du + 0.9 * gateSide, 2.6);
    });
    // (dome-detail-275, the roof sweep) the canal tiles in relief down the four slopes, the cap tiles down the hips
    canalTiles(sink, frame, look, { hipEnds: false });
    hipCaps(sink, frame);
  });
  return sink.finish();
};

// ------------------------------------------------------------------------------------------------ the town's monuments

/**
 * The casa consistorial on the square: two storeys and a hipped tile roof, the main floor carried forward over the
 * square on an arcade of stone piers and round arches (soportales), a balcony at every bay above it and the main
 * balcony in the middle under a stone surround, quoins, a string course and a cornice; over the middle bay the clock
 * and bell gable (espadaña) with its clock face, its bell in an arch, a pediment and an iron cross. (dome-detail-275;
 * the work list's density, the roof bar: a smooth hipped roof the size of the square's side) The canal tiles in relief
 * down every slope and the cap tiles down the hips; the clock's gable dressed as a remate (its pilasters, the scrolls
 * either side, the cornice and its pinnacles, the bell gable's courses and the bell on its yoke); the town's arms in
 * stone over the main balcony under their crown, the flags out from its railing; the arcade's piers on their bases
 * under their capitals, its floor paved a step up from the square, lanterns on the piers; the damp's tide at the back
 * and ends. (The balconies' balusters and the clock's hours flat irons, the arcade's spandrels faced: the budget.)
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
  // (the back's windows a bay of six metres, the budget: dome-detail-275)
  for (const i of [0, 1]) for (const o of windowRhythm('left', i, L, { w: 1.0, h: i ? 1.6 : 1.35, sill: i ? 0.7 : 1.1, spacing: 6.0, margin: 2.2 })) openings.push(o);
  const cx = back + body / 2;
  // (dome-detail-275, the budget) the kit's dialect, its windows paired casements under no blinds, its balconies'
  // doors under a transom only in the middle bay
  const cst: AndalusianState = { ...st, reja: null, band: 'plaster2', flatRails: true, window: { ...st.window, bars: 'two', shutters: null, surround: { bucket: 'stone', width: 0.16, out: 0.03, lintel: 0.22 } } };
  const kit = dialect(cst, look);
  const civic: HouseDialect = {
    window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { ...cst.window, shutters: null }, cst.rng, cst.litShare),
    door: (s, face, o, y0, frame) => {
      if (o.storey === 0) { kit.door(s, face, o, y0, frame); return; }
      doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, {
        leaf: cst.joinery, frame: { bucket: 'plaster2', width: 0.14, out: 0.015 }, steps: null, leafKind: 'glazed', transom: o.w > 1.2,
      });
      balcony(s, face, o.u, y0 + o.y0, o.w + 0.55, 0.5, look, cst.mobile, true);
    },
  };
  sink.placed(0, xc, 0, 0, () => streetwise(sink, () => sink.placed(0, cx, 0, 0, () => {
    const frame = buildHouse(sink, {
      w: body, d: L, plinth: { h: plinth, out: 0.06, bucket: 'stone' },
      storeys: [{ h: g0, wall: 'plaster' }, { h: g1, wall: 'plaster', jetty: [0, arcade, 0, 0] }],
      roof: canal(20, 0.42, 0.42, 'hip'), openings, gutters: null, verge: null, spall: null, reveal: 0.32,
      chimneys: [{ x: -body * 0.25, z: -L * 0.3, sx: 0.7, sz: 0.7, above: 0.8, bucket: 'plaster', cap: 'tile' },
        { x: -body * 0.25, z: L * 0.3, sx: 0.7, sz: 0.7, above: 0.8, bucket: 'plaster', cap: 'tile' }],
    }, civic);
    const eaveY = frame.eaveY, top = frame.bodies[1], floorY = frame.floors[1];
    // (dome-detail-275) the canal tiles down the slopes in two facets a roll (the roof is the size of the square's side),
    // the cap tiles down its hips
    canalTiles(sink, frame, look, { pitch: 0.42, facets: 2, every: 2, whole: true, hipEnds: false });
    hipCaps(sink, frame);
    // the arcade: stone piers on the square's line, round arches between them, a stone architrave under the main floor
    const front: Face = { origin: [top.x1, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: L };
    for (let k = 0; k <= bays; k++) {
      const p = k === 0 || k === bays ? 0.38 : 0.3;
      const uu = clamp(-L / 2 + k * bay, -L / 2 + p, L / 2 - p);
      sink.span('stone', top.x1 - 0.62, -0.4, -uu - p, top.x1, floorY, -uu + p);
      faceBox(sink, 'stone', front, uu, 0.3, 0.04, 2 * p + 0.12, 0.6, 0.08, { decor: true });
      faceBox(sink, 'stone', front, uu, floorY - 1.1, 0.04, 2 * p + 0.1, 0.16, 0.08, { decor: true });
      // (dome-detail-275) the pier's capital under the arches' springing, a moulding stepped out over the impost
      faceBox(sink, 'stone', front, uu, floorY - 1.24, 0.07, 2 * p + 0.2, 0.12, 0.14, { decor: true, shadow: true });
    }
    // (the spandrels faced: their fronts and backs and the intrados between, each strip; the budget, dome-detail-275)
    for (let k = 0; k < bays; k++) {
      const u0 = -L / 2 + k * bay + 0.3, u1 = -L / 2 + (k + 1) * bay - 0.3, r = (u1 - u0) / 2;
      arcadeFill(sink, front, (u0 + u1) / 2, r, floorY - 1.0 - r * 0.92, r * 0.92, floorY, 0.5, 5);
    }
    sink.span('stone', top.x1 - 0.55, floorY - 0.22, -L / 2, top.x1 + 0.06, floorY + 0.05, L / 2, { decor: true });
    // (dome-detail-275) the arcade's floor paved a step up from the square, its kerb along the piers' line
    sink.span('stone', top.x1 - arcade, -0.3, -L / 2 + 0.05, top.x1 - 0.3, 0.14, L / 2 - 0.05, { decor: true, shade: 0.86 });
    sink.span('stone', top.x1 - 0.3, -0.3, -L / 2 + 0.05, top.x1 + 0.08, 0.12, L / 2 - 0.05, { decor: true });
    // (dome-detail-275) a lantern on the piers either side of the middle arch
    for (const e of [-1, 1]) wallLantern(sink, front, e * bay * 1.5, floorY - 2.2);
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
    // (dome-detail-275) the town's arms over it: the shield in its stone cartouche, quartered in the old colours, under
    // its crown
    const ay = floorY + 3.12;
    faceBox(sink, 'stone', front, 0, ay + 0.38, 0.05, 1.0, 0.76, 0.1, { decor: true });
    const shield = (o: number, sc: number): Array<[number, number]> => [[-0.32 * sc, ay + 0.72], [0.32 * sc, ay + 0.72], [0.32 * sc, ay + 0.3], [0.2 * sc, ay + 0.1],
      [0, ay + 0.04 + o], [-0.2 * sc, ay + 0.1]];
    facePrism(sink, 'stone', front, shield(0, 1), 0.1, 0.06, { decor: true, shadow: true });
    const arms = [rgb(0x8a2a24), AZ_OCHRE, AZ_BLUE, AZ_WHITE];
    for (const [k, [qu, qy]] of [[-0.12, ay + 0.55], [0.12, ay + 0.55], [-0.1, ay + 0.3], [0.1, ay + 0.3]].entries()) {
      faceBox(sink, 'structureMetal', front, qu, qy, 0.165, 0.2, 0.2, 0.01, { colour: shade(arms[k], 0.9), decor: true });
    }
    faceBox(sink, 'structureMetal', front, 0, ay + 0.8, 0.13, 0.5, 0.1, 0.08, { colour: AZ_OCHRE, decor: true });
    for (const e of [-1, 0, 1]) faceBox(sink, 'structureMetal', front, e * 0.18, ay + 0.9, 0.13, 0.07, 0.1 + (e ? 0 : 0.06), 0.07, { colour: AZ_OCHRE, decor: true });
    // (dome-detail-275) the flags out from the main balcony's railing on their poles: the nation's, the region's
    const rail = floorY + 0.98, ro = 0.47;
    const flags: Array<[number, readonly Rgb[]]> = [[-0.55, [rgb(0xaa1e22), rgb(0xe0b020), rgb(0xaa1e22)]], [0.55, [rgb(0x1e7a3a), rgb(0xecece4), rgb(0x1e7a3a)]]];
    for (const [fu, stripes] of flags) {
      const tip = facePoint(front, fu * 1.6, rail + 1.55, ro + 1.0), foot = facePoint(front, fu, rail - 0.02, ro);
      const dir = normalize3(sub3(tip, foot)), n = normalize3(cross3(dir, [0, 1, 0])), root = lerp3(tip, 1, dir, -0.7);
      sink.member('structureMetal', foot, tip, 0.035, 0.035, n, { colour: rgb(0xb8b4a8), decor: true, exposed: true }, 0.0175);
      // the cloth hung from the pole's last 0.7 m in three stripes, each a third of its drop, its top edge on the pole
      for (let i = 0; i < 3; i++) {
        const d0 = i * 0.3, d1 = d0 + 0.3, dn = (p: Vec3, d: number): Vec3 => [p[0], p[1] - d, p[2]];
        prismAuto(sink, 'structureWood', [dn(root, d0), dn(tip, d0), dn(tip, d1), dn(root, d1)].map((q) => lerp3(q, 1, n, -0.006)), n, 0.012,
          { colour: stripes[i], decor: true });
      }
    }
    // the clock and bell gable over the middle bay, standing on the front wall's head: the clock on its lower block
    const gw = 4.4;
    espadana(sink, front, eaveY + 1.9, gw * 0.62, 0.5, 0.3, true, true);
    wallPolygon(sink, 'plaster', front, [[-gw / 2, eaveY - 0.3], [gw / 2, eaveY - 0.3], [gw / 2, eaveY + 1.9], [-gw / 2, eaveY + 1.9]], 0.5);
    sink.band('stone', top.x1 - 0.5, eaveY + 1.9, -gw / 2 - 0.08, top.x1 + 0.1, eaveY + 2.1, gw / 2 + 0.08, { decor: true, shadow: true });
    // (dome-detail-275) the remate dressed: stone pilasters at the clock block's sides, the scrolls (aletones) either
    // side of it down to the cornice, a pinnacle over each pilaster
    for (const e of [-1, 1]) {
      faceBox(sink, 'stone', front, e * (gw / 2 - 0.16), eaveY + 0.8, 0.04, 0.32, 2.2, 0.08, { decor: true });
      facePrism(sink, 'stone', front, [[e * gw / 2, eaveY - 0.3], [e * (gw / 2 + 0.85), eaveY - 0.3], [e * (gw / 2 + 0.3), eaveY + 0.5], [e * gw / 2, eaveY + 1.5]], -0.38, 0.32,
        { decor: true, shadow: true });
      sink.span('stone', top.x1 - 0.42, eaveY + 2.1, e * (gw / 2 - 0.16) - 0.2, top.x1 + 0.02, eaveY + 2.5, e * (gw / 2 - 0.16) + 0.2, { decor: true });
      pinaculo(sink, facePoint(front, -e * (gw / 2 - 0.16), eaveY + 2.5, -0.2), 1.1, AZ_GREEN);
    }
    // (round 3, gauntlet wave 108c: "no visible clock face" from the square: the dial 1.1 m across read as a dot at 60 m;
    // now 1.6 m in a stone ring, its hours marked, its hands long)
    const clockC = facePoint(front, 0, eaveY + 0.8, 0.0);
    sink.cylinder('stone', clockC, 'x', 0.1, 0.94, 20, { decor: true });
    sink.cylinder('structureMetal', [clockC[0] + 0.1, clockC[1], clockC[2]], 'x', 0.02, 0.8, 20, { colour: rgb(0xece6d6), decor: true });
    // (dome-detail-275) the hours' marks and the hands flat irons on the dial
    const mark = (cy: number, cz: number, hy: number, hz: number) => facing(sink, 'structureMetal', [[clockC[0] + 0.125, cy - hy, cz - hz], [clockC[0] + 0.125, cy - hy, cz + hz],
      [clockC[0] + 0.125, cy + hy, cz + hz], [clockC[0] + 0.125, cy + hy, cz - hz]], [1, 0, 0], { colour: IRON, decor: true });
    for (let h = 0; h < 12; h++) {
      const a = (h / 12) * Math.PI * 2, r = 0.68, s = h % 3 === 0 ? 0.045 : 0.028;
      mark(clockC[1] + Math.cos(a) * r, clockC[2] + Math.sin(a) * r, s, s);
    }
    mark(clockC[1] + 0.29, clockC[2], 0.31, 0.03);
    mark(clockC[1], clockC[2] + 0.2, 0.03, 0.22);
    // (dome-detail-275) the damp's tide along the back and the ends
    dampFoot(sink, frame.faces.left, -L / 2 + 0.1, L / 2 - 0.1, plinth, look, 2);
    for (const name of ['front', 'back'] as const) dampFoot(sink, frame.faces[name], -frame.faces[name].width / 2 + 0.1, frame.faces[name].width / 2 - 0.1, plinth, look, 1);
  })));
  return sink.finish();
};

/**
 * (dome-detail-275) An arcade's spandrels as faced strips (archFill's ground for a long arcade's budget): over each step
 * of the intrados (a half circle of half-width r springing at `spring`, its rise `rise`) up to the head line `top`, the
 * strip's face and back and its soffit under it; the voussoirs round the intrados as archFill lays them.
 */
function arcadeFill(sink: PartSink, face: Face, uc: number, r: number, spring: number, rise: number, top: number, depth: number, n: number): void {
  const at = (i: number): [number, number] => { const a = Math.PI * i / n; return [uc - Math.cos(a) * r, spring + Math.sin(a) * rise]; };
  const down: Vec3 = [0, -1, 0], back: Vec3 = [-face.out[0], 0, -face.out[2]];
  for (let i = 0; i < n; i++) {
    const [ua, ya] = at(i), [ub, yb] = at(i + 1);
    const P = (u: number, y: number, o: number) => facePoint(face, u, y, o);
    facing(sink, 'plaster', [P(ua, ya, 0), P(ub, yb, 0), P(ub, top, 0), P(ua, top, 0)], face.out, { decor: true });
    facing(sink, 'plaster', [P(ua, ya, -depth), P(ub, yb, -depth), P(ub, top, -depth), P(ua, top, -depth)], back, { decor: true });
    facing(sink, 'plaster', [P(ua, ya, 0), P(ub, yb, 0), P(ub, yb, -depth), P(ua, ya, -depth)], i < n / 2 ? lerp3(down, 1, face.u, 1) : lerp3(down, 1, face.u, -1), { decor: true });
  }
  const ring = Math.min(0.3, (top - spring - rise) + 0.12);
  const joint = (i: number): Vec3 => {
    const a = Math.PI * i / n;
    return facePoint(face, uc - Math.cos(a) * (r + ring / 2), spring + Math.sin(a) * (rise + ring / 2), 0);
  };
  for (let i = 0; i < n; i++) sink.member('stone', joint(i), joint(i + 1), ring, 0.05, face.out, { decor: true }, 0.01);
}

// ------------------------------------------------------------------------------------------------ the parish church

/**
 * (dome-detail-275) The glazed tile (azulejo) of the Serranía's spires, pinnacles and wall shrines: cobalt, the tin
 * white ground, copper green, the yellow ochre; the oak of the bells' yokes.
 */
const AZ_BLUE = rgb(0x2b5a94), AZ_WHITE = rgb(0xe8e4d8), AZ_GREEN = rgb(0x3b6c56), AZ_OCHRE = rgb(0xc49438);
const OAK = rgb(0x3b2c20);

const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross3 = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot3 = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** (dome-detail-275) A convex polygon extruded `depth` along `dir`, wound to suit PartSink.prism whichever way it runs. */
function prismAuto(sink: PartSink, bucket: RegionalBucket, pts: readonly Vec3[], dir: Vec3, depth: number, opts: EmitOptions): void {
  const ccw = dot3(cross3(sub3(pts[1], pts[0]), sub3(pts[2], pts[0])), dir) > 0;
  sink.prism(bucket, ccw ? pts : [...pts].reverse(), dir, depth, opts);
}

/** (dome-detail-275) A convex polygon in a face's [u, y] standing `o0` out of it, extruded `depth` further out (a pediment, a scroll). */
function facePrism(sink: PartSink, bucket: RegionalBucket, face: Face, pts: ReadonlyArray<readonly [number, number]>, o0: number, depth: number,
  opts: EmitOptions): void {
  prismAuto(sink, bucket, pts.map(([u, y]) => facePoint(face, u, y, o0)), face.out, depth, opts);
}

/**
 * (dome-detail-275) A ring of dressed voussoirs `ring` wide round a round head (u, springing y, intrados r), standing
 * `depth` proud, every other stone a shade apart, the keystone the deepest.
 */
function voussoirs(sink: PartSink, face: Face, u: number, y: number, r: number, ring: number, depth: number, n = 9): void {
  const at = (i: number): Vec3 => {
    const a = Math.PI * i / n;
    return facePoint(face, u + Math.cos(a) * (r + ring / 2), y + Math.sin(a) * (r + ring / 2), 0);
  };
  for (let i = 0; i < n; i++) sink.member('stone', at(i), at(i + 1), ring, depth, face.out, { decor: true, ends: true, ...(i % 2 ? { shade: 0.92 } : {}) }, 0.01);
  faceBox(sink, 'stone', face, u, y + r + ring * 0.45, (depth + 0.04) / 2, 0.3, ring + 0.2, depth + 0.04, { decor: true });
}

/** (dome-detail-275) The arched head of a door's leaf in its reveal: the planked oak over the springing, to the intrados. */
function fanLeaf(sink: PartSink, face: Face, u: number, y: number, r: number, colour: Rgb): void {
  const o = sink.recess > 0 ? -sink.recess + 0.022 : 0.012;
  const pts: Vec3[] = [facePoint(face, u - r, y, o), facePoint(face, u + r, y, o)];
  for (let j = 1; j < 8; j++) { const a = Math.PI * j / 8; pts.push(facePoint(face, u + Math.cos(a) * r, y + Math.sin(a) * r, o)); }
  sink.polygon('structureWood', pts, { colour, decor: true });
}

/** (dome-detail-275) A column of a portal standing on p: its Attic base, the shaft swelling a little, the capital and abacus. */
function columna(sink: PartSink, p: Vec3, h: number, c: number): void {
  // (the budget, 12,000 a build: eight sides and the mouldings that read at range)
  sink.revolve('stone', p, 'y', [[0, c + 0.09], [0.1, c + 0.09], [0.2, c], [h * 0.4, c + 0.012], [h - 0.28, c - 0.02], [h - 0.12, c + 0.08],
    [h - 0.12, c + 0.12], [h, c + 0.12], [h, 0]], 8, { decor: true, shadow: true });
}

/** (dome-detail-275) A stone pinnacle on p (pirámide y bola): its plinth, the tapering needle, the ball (glazed, or stone). */
function pinaculo(sink: PartSink, p: Vec3, s: number, glaze: Rgb | null): void {
  const needle: Array<[number, number]> = [[0, 0.15 * s], [0.12 * s, 0.15 * s], [0.12 * s, 0.1 * s], [0.64 * s, 0.035 * s]];
  if (!glaze) needle.push([0.72 * s, 0.1 * s], [0.84 * s, 0]);
  sink.revolve('stone', p, 'y', needle, 6, { decor: true });
  if (glaze) sink.revolve('structureMetal', [p[0], p[1] + 0.62 * s, p[2]], 'y', [[0, 0], [0.1 * s, 0.11 * s], [0.21 * s, 0]], 6, { colour: glaze, decor: true });
}

/** (dome-detail-275) The parish's saint in a niche, standing on p: the robe falling to its hem, the shoulders, the head, `h` tall. */
function santo(sink: PartSink, p: Vec3, h: number): void {
  sink.revolve('stone', p, 'y', [[0, 0.14 * h], [0.1 * h, 0.15 * h], [0.66 * h, 0.115 * h], [0.8 * h, 0.06 * h], [0.84 * h, 0.05 * h], [0.94 * h, 0.065 * h],
    [h, 0]], 6, { decor: true, shade: 1.06 });
}

/**
 * (dome-detail-275) A bell of the belfry hung from its axle at `axle`, `o` into the opening: the bronze turned (its lip,
 * waist and crown; it was a frustum), and over it the oak yoke (yugo) a Spanish bell swings full circle on.
 */
function campana(sink: PartSink, face: Face, u: number, axle: number, o: number, r: number): void {
  const m = facePoint(face, u, axle - 0.12 - 1.15 * r, o);
  sink.revolve('structureMetal', m, 'y', [[0.12 * r, 0], [0, r], [0.35 * r, 0.78 * r], [0.8 * r, 0.6 * r], [1.08 * r, 0.45 * r], [1.15 * r, 0]], 8,
    { colour: BELL, decor: true });
  freeBox(sink, 'structureWood', face, u, axle + 0.04, o, 2.1 * r + 0.24, 0.36, 0.34, { colour: OAK, decor: true });
}

/**
 * (dome-detail-275) Dressed quoins up a corner (x, z) of a whitewashed body from y0 to y1, alternately long on its two
 * faces; sx, sz the corner's signs.
 */
function quoinsAt(sink: PartSink, x: number, z: number, sx: number, sz: number, y0: number, y1: number, course = 0.72): void {
  for (let y = y0, k = 0; y < y1 - course * 0.6; y += course, k++) {
    const lx = k % 2 ? 0.62 : 0.36, lz = k % 2 ? 0.36 : 0.62, x0 = x - sx * lx, x1 = x + sx * 0.03, z0 = z - sz * lz, z1 = z + sz * 0.03;
    const ya = y, yb = Math.min(y1, y + course - 0.05);
    // (the budget: its two faces out of the wall and its bed; the 3 cm returns and its underside are never seen at range)
    sink.box('stone', [(x0 + x1) / 2, (ya + yb) / 2, (z0 + z1) / 2], [Math.abs(x1 - x0) / 2, (yb - ya) / 2, Math.abs(z1 - z0) / 2], { decor: true }, undefined,
      { px: sx < 0, nx: sx > 0, pz: sz < 0, nz: sz > 0, ny: true });
  }
}

/**
 * (dome-detail-275) A wrought-iron grille over a high light (u, y its foot, w x h): the frame and its square bars as flat
 * irons 4 cm proud of the wall, two flats across (the budget: the kit's reja draws every bar as a box).
 */
function rejilla(sink: PartSink, face: Face, u: number, y: number, w: number, h: number, pitch = 0.14): void {
  const c = { colour: IRON, decor: true } as const, o = 0.04;
  const bar = (ua: number, ub: number, ya: number, yb: number) => sink.quad('structureMetal', facePoint(face, ua, ya, o), facePoint(face, ub, ya, o),
    facePoint(face, ub, yb, o), facePoint(face, ua, yb, o), c);
  const x0 = u - w / 2 - 0.05, x1 = u + w / 2 + 0.05, y0 = y - 0.05, y1 = y + h + 0.05;
  for (const x of [x0, x1]) faceBox(sink, 'structureMetal', face, x, (y0 + y1) / 2, o / 2, 0.04, y1 - y0, o, c, { back: true });
  for (const yy of [y0, y1, y0 + (y1 - y0) * 0.36, y0 + (y1 - y0) * 0.7]) bar(x0, x1, yy - 0.02, yy + 0.02);
  const n = Math.max(3, Math.round((x1 - x0) / pitch));
  for (let k = 1; k < n; k++) { const xx = x0 + (x1 - x0) * k / n; bar(xx - 0.013, xx + 0.013, y0, y1); }
}

/**
 * (dome-detail-275) The foot of a whitewashed wall between u0 and u1 over y0: the rising damp's ragged tide, grey-ochre
 * at the plinth and fading up into the lime, and here and there a patch where the render has fallen and the rubble
 * shows (dressing a hand proud of the wall).
 */
function dampFoot(sink: PartSink, face: Face, u0: number, u1: number, y0: number, look: () => number, patches = 2): void {
  if (u1 - u0 < 0.3) return;
  const n = Math.max(1, Math.round((u1 - u0) / 1.1));
  const hs = Array.from({ length: n + 1 }, () => 0.3 + look() * 0.55);
  const tintAt = (p: Vec3): Rgb => { const t = clamp((p[1] - y0) / 0.9, 0, 1); return [0.84 + 0.15 * t, 0.81 + 0.17 * t, 0.73 + 0.24 * t]; };
  for (let i = 0; i < n; i++) {
    const ua = u0 + (u1 - u0) * i / n, ub = u0 + (u1 - u0) * (i + 1) / n;
    sink.quad('plaster', facePoint(face, ua, y0, 0.01), facePoint(face, ub, y0, 0.01), facePoint(face, ub, y0 + hs[i + 1], 0.01),
      facePoint(face, ua, y0 + hs[i], 0.01), { decor: true, tintAt });
  }
  for (let k = 0; k < patches && u1 - u0 > 1.4; k++) {
    const pu = u0 + 0.7 + look() * (u1 - u0 - 1.4), py = y0 + 0.2 + look() * 0.6, r = 0.14 + look() * 0.18;
    // a ragged edge: a fan round its middle, each spoke its own length
    const rim = Array.from({ length: 6 }, (_, j) => {
      const a = j / 6 * Math.PI * 2, rr = r * (0.6 + look() * 0.7);
      return facePoint(face, pu + Math.cos(a) * rr * 1.6, py + Math.sin(a) * rr, 0.014);
    });
    const mid = facePoint(face, pu, py, 0.014);
    for (let j = 0; j < 6; j++) sink.polygon('stone', [mid, rim[j], rim[(j + 1) % 6]], { decor: true, shade: 0.8, tint: [0.97, 0.94, 0.88] });
  }
}

/**
 * (dome-detail-275) A stepped buttress (contrafuerte) against a wall face at u, from under the ground to `top`: the
 * whitewashed lower stage `proj` out, greyed by the damp at its foot, a dressed stone weathering sloping back to the
 * upper stage, the upper stage and its own sloped stone cap into the wall, a drip course under each.
 */
function contrafuerte(sink: PartSink, face: Face, u: number, top: number, proj: number, w: number, look: () => number): void {
  const mid = top * (0.5 + look() * 0.08), p2 = proj * (0.58 + look() * 0.08), cap1 = (proj - p2) * 1.1, cap2 = p2 * 1.25, w2 = w - 0.1;
  // (dome-detail-275, the roof sweep's triangle trade) the stages' buried faces left out: the foot in the ground, each
  // stage's head under its drip course, the upper stage's bed on the lower drip; the upper drip's head under its cap
  faceBox(sink, 'plaster', face, u, (mid - 0.4) / 2, proj / 2, w, mid + 0.4, proj, { shadeAt: (p: Vec3) => clamp(0.82 + 0.18 * p[1] / 1.3, 0.82, 1) },
    { back: true, top: true, bottom: true });
  faceBox(sink, 'plaster', face, u, (mid + top) / 2, p2 / 2, w2, top - mid, p2, {}, { back: true, top: true, bottom: true });
  const opts = { shadow: true } as const;
  prismAuto(sink, 'stone', [facePoint(face, u - w / 2 - 0.02, mid, p2), facePoint(face, u - w / 2 - 0.02, mid, proj + 0.04),
    facePoint(face, u - w / 2 - 0.02, mid + cap1, p2)], face.u, w + 0.04, opts);
  prismAuto(sink, 'stone', [facePoint(face, u - w2 / 2 - 0.02, top, 0), facePoint(face, u - w2 / 2 - 0.02, top, p2 + 0.04),
    facePoint(face, u - w2 / 2 - 0.02, top + cap2, 0)], face.u, w2 + 0.04, opts);
  faceBox(sink, 'stone', face, u, mid - 0.05, (proj + 0.04) / 2, w + 0.04, 0.1, proj + 0.04, { decor: true });
  faceBox(sink, 'stone', face, u, top - 0.05, (p2 + 0.04) / 2, w2 + 0.04, 0.1, p2 + 0.04, { decor: true }, { back: true, top: true });
}

/**
 * (dome-detail-275) The stone portal (portada) of a parish church round an arched door cut through its wall, in the
 * gorge's golden stone on the white wall (the Serranía's Renaissance and Baroque frontispieces): the door's jambs, its
 * imposts and voussoirs and the keystone; either side a pedestal and a column before its pilaster (a side door's: the
 * pilaster alone on its base); the entablature broken forward over the columns, the frieze's inscription panel; the
 * upper body, a shell-headed niche between scrolls with the parish's saint on his corbel, its cornice, the pediment and
 * its iron cross; the stone pinnacles over the columns. Dressing on the face; `floor` the sill, `dw` the door's width,
 * `spring` its arch's springing over the sill. Returns the frontispiece's half width.
 */
function portada(sink: PartSink, face: Face, u: number, floor: number, dw: number, spring: number, columns: boolean): number {
  const r = dw / 2, ring = 0.26, R = r + ring, ys = floor + spring, crown = ys + r;
  const cu = R + (columns ? 0.46 : 0.3), hw = cu + (columns ? 0.38 : 0.3), ped = columns ? 0.95 : 0;
  const eb = crown + ring + 0.24, et = eb + 0.82;
  const dec = { decor: true } as const, cast = { decor: true, shadow: true } as const;
  // the frontispiece's ashlar on the lime: the fields either side of the door, the spandrels over its arch
  for (const s of [-1, 1]) faceBox(sink, 'stone', face, u + s * (R + hw) / 2, (floor + eb) / 2, 0.03, hw - R, eb - floor, 0.06, dec);
  for (let i = 0; i < 8; i++) {
    const a = Math.PI * i / 8, b = Math.PI * (i + 1) / 8;
    sink.quad('stone', facePoint(face, u + Math.cos(b) * R, ys + Math.sin(b) * R, 0.06), facePoint(face, u + Math.cos(a) * R, ys + Math.sin(a) * R, 0.06),
      facePoint(face, u + Math.cos(a) * R, eb, 0.06), facePoint(face, u + Math.cos(b) * R, eb, 0.06), dec);
  }
  // the jambs and imposts, the voussoirs and the keystone
  for (const s of [-1, 1]) {
    faceBox(sink, 'stone', face, u + s * (r + ring / 2), floor + spring / 2, 0.06, ring, spring, 0.12, dec);
    faceBox(sink, 'stone', face, u + s * (r + ring / 2), ys - 0.07, 0.08, ring + 0.12, 0.14, 0.16, dec);
  }
  voussoirs(sink, face, u, ys, r, ring, 0.12);
  // the orders either side
  for (const s of [-1, 1]) {
    const cx = u + s * cu;
    if (columns) {
      faceBox(sink, 'stone', face, cx, floor + ped / 2, 0.33, 0.66, ped, 0.66, cast);
      faceBox(sink, 'stone', face, cx, floor + ped - 0.05, 0.36, 0.74, 0.1, 0.72, dec);
      faceBox(sink, 'stone', face, cx, floor + 0.06, 0.36, 0.74, 0.12, 0.72, dec);
      faceBox(sink, 'stone', face, cx, (floor + ped + eb) / 2, 0.1, 0.44, eb - floor - ped, 0.08, dec, { back: true });
      columna(sink, facePoint(face, cx, floor + ped, 0.33), eb - floor - ped, 0.17);
    } else {
      faceBox(sink, 'stone', face, cx, (floor + eb) / 2, 0.09, 0.42, eb - floor, 0.18, cast);
      faceBox(sink, 'stone', face, cx, floor + 0.2, 0.11, 0.52, 0.4, 0.22, dec);
      faceBox(sink, 'stone', face, cx, eb - 0.1, 0.12, 0.54, 0.2, 0.24, dec);
    }
  }
  // the entablature: architrave, the frieze and its inscription, the cornice; broken forward over the columns
  faceBox(sink, 'stone', face, u, eb + 0.12, 0.2, 2 * hw, 0.24, 0.4, dec);
  faceBox(sink, 'stone', face, u, eb + 0.42, 0.18, 2 * hw - 0.08, 0.36, 0.36, dec);
  faceBox(sink, 'stone', face, u, eb + 0.42, 0.37, Math.min(1.3, 2 * R), 0.22, 0.02, { decor: true, tint: [1.1, 1.07, 1.0] });
  faceBox(sink, 'stone', face, u, eb + 0.7, 0.32, 2 * hw + 0.24, 0.24, 0.64, cast);
  if (columns) for (const s of [-1, 1]) faceBox(sink, 'stone', face, u + s * cu, eb + 0.3, 0.33, 0.66, 0.6, 0.66, dec);
  // the upper body: the niche between its pilasters and the scrolls, the saint on his corbel under the shell
  const nw = columns ? 0.95 : 0.8, nh = columns ? 1.45 : 1.1, top = et + nh + 0.34;
  faceBox(sink, 'stone', face, u, (et + top) / 2, 0.05, nw + 0.72, top - et, 0.1, dec);
  for (const s of [-1, 1]) {
    faceBox(sink, 'stone', face, u + s * (nw / 2 + 0.2), (et + top) / 2, 0.13, 0.18, top - et, 0.06, dec, { back: true });
    facePrism(sink, 'stone', face, [[u + s * (nw / 2 + 0.36), et], [u + s * (hw - 0.05), et], [u + s * (nw / 2 + 0.36), et + nh * 0.7]], 0, 0.2, dec);
  }
  const ns = et + 0.16, nsp = ns + nh - nw / 2;
  const hollow: Vec3[] = [facePoint(face, u - nw / 2, ns, 0.102), facePoint(face, u + nw / 2, ns, 0.102)];
  for (let i = 0; i <= 8; i++) { const a = Math.PI * i / 8; hollow.push(facePoint(face, u + Math.cos(a) * nw / 2, nsp + Math.sin(a) * nw / 2, 0.102)); }
  sink.polygon('stone', hollow, { decor: true, shade: 0.52 });
  voussoirs(sink, face, u, nsp, nw / 2, 0.12, 0.14, 7);
  faceBox(sink, 'stone', face, u, ns + 0.05, 0.2, nw * 0.55, 0.1, 0.2, dec);
  santo(sink, facePoint(face, u, ns + 0.1, 0.2), nh * 0.74);
  // its cornice, the pediment and the iron cross on its apex; the pinnacles on the entablature
  faceBox(sink, 'stone', face, u, top + 0.07, 0.15, nw + 0.96, 0.14, 0.3, cast);
  const pw = nw + 1.0, apex = top + 0.14 + pw * 0.28;
  facePrism(sink, 'stone', face, [[u - pw / 2, top + 0.14], [u + pw / 2, top + 0.14], [u, apex]], 0, 0.26, cast);
  const iron = { colour: IRON, decor: true } as const;
  faceBox(sink, 'structureMetal', face, u, apex + 0.27, 0.13, 0.05, 0.65, 0.05, iron);
  faceBox(sink, 'structureMetal', face, u, apex + 0.42, 0.13, 0.36, 0.05, 0.05, iron);
  for (const s of [-1, 1]) pinaculo(sink, facePoint(face, u + s * (columns ? cu : hw - 0.15), et, 0.33), columns ? 1.0 : 0.8, null);
  return hw + 0.12;
}

/**
 * (dome-detail-275) A tiled wall shrine (retablo cerámico) on a face at (u, y its foot): the glazed picture of the
 * parish's Virgin in her blue border on a stone frame, under a little tile hood, a lamp on its iron arm beside it,
 * geraniums on the ledge under it.
 */
function retablo(sink: PartSink, face: Face, u: number, y: number, look: () => number): void {
  const w = 0.9, h = 1.2, glaze = (c: Rgb) => ({ colour: c, decor: true }) as const;
  faceBox(sink, 'stone', face, u, y + h / 2, 0.04, w + 0.24, h + 0.24, 0.08, { decor: true });
  // (dome-detail-275, the roof sweep's triangle trade) each tile panel's back laid on the one under it, left out
  const bk = { back: true } as const;
  faceBox(sink, 'structureMetal', face, u, y + h / 2, 0.085, w, h, 0.012, glaze(AZ_WHITE), bk);
  for (const s of [-1, 1]) {
    faceBox(sink, 'structureMetal', face, u + s * (w / 2 - 0.06), y + h / 2, 0.093, 0.12, h, 0.008, glaze(AZ_BLUE), bk);
    faceBox(sink, 'structureMetal', face, u, y + h / 2 + s * (h / 2 - 0.06), 0.093, w - 0.24, 0.12, 0.008, glaze(AZ_BLUE), bk);
  }
  faceBox(sink, 'structureMetal', face, u, y + h * 0.78, 0.095, 0.4, 0.22, 0.008, glaze(AZ_OCHRE), bk);
  faceBox(sink, 'structureMetal', face, u, y + h * 0.42, 0.097, 0.34, 0.62, 0.008, glaze(shade(AZ_BLUE, 0.8)), bk);
  faceBox(sink, 'structureMetal', face, u, y + h * 0.4, 0.1, 0.12, 0.48, 0.006, glaze(rgb(0xb0503a)), bk);
  const x0 = u - w / 2 - 0.22, x1 = u + w / 2 + 0.22, yh = y + h + 0.14;
  const pts: Vec3[] = [facePoint(face, x0, yh, 0.32), facePoint(face, x1, yh, 0.32), facePoint(face, x1, yh + 0.22, 0), facePoint(face, x0, yh + 0.22, 0)];
  sink.prism('roof', pts, normalize3([face.out[0] * 0.2, 1, face.out[2] * 0.2]), 0.06, { decor: true, shadow: true });
  wallLantern(sink, face, u + w / 2 + 0.45, y + h * 0.8);
  faceBox(sink, 'stone', face, u, y - 0.16, 0.12, w + 0.3, 0.08, 0.24, { decor: true });
  potOn(sink, facePoint(face, u - 0.26, y - 0.12, 0.13), 0.2, look);
}

// ------------------------------------------------------------------------------------------------ the tiles in relief

const lerp3 = (a: Vec3, ka: number, b: Vec3, kb: number): Vec3 => [a[0] * ka + b[0] * kb, a[1] * ka + b[1] * kb, a[2] * ka + b[2] * kb];

/** (dome-detail-275) A convex polygon wound to face `toward`. */
function facing(sink: PartSink, bucket: RegionalBucket, pts: Vec3[], toward: Vec3, opts: EmitOptions): void {
  sink.polygon(bucket, dot3(cross3(sub3(pts[1], pts[0]), sub3(pts[2], pts[0])), toward) >= 0 ? pts : [...pts].reverse(), opts);
}

/**
 * (dome-detail-275) A roof slope in its own terms: a point `v` up the slope from the eave's edge, `t` along it, `h` off
 * the covering; `lim(v)` how far either way the slope reaches at `v` (a hip closing it: `closes`); `reach` its run to
 * the ridge (a shed's: to its high wall).
 */
interface TileSlope {
  at: (v: number, t: number, h: number) => Vec3; n: Vec3; up: Vec3; along: Vec3; lim: (v: number) => number;
  /** (the roof sweep) how far up the slope a row at `t` reaches before the hip closes over it */
  upTo: (t: number) => number;
  reach: number; side: 1 | -1; end: boolean; closes: boolean;
}

/**
 * (the roof sweep) The hips' own pitch: a hip roof wider across its ridge than along it closes on steeper ends
 * (house.ts RoofGeometry.hipTan): its side slopes narrow faster and its end slopes stand steeper than the sides.
 */
function tileSlope(rg: HouseFrame['roof'], roof: RoofSpec, side: 1 | -1, end: boolean): TileSlope {
  const cosP = 1 / Math.hypot(1, rg.tanP), sinP = rg.tanP * cosP, xe = rg.s + roof.eave;
  const D = rg.halfD + (rg.hipVerge ?? roof.verge), hip = rg.kind === 'hip', hT = rg.hipTan ?? rg.tanP;
  if (end) {
    const cosH = 1 / Math.hypot(1, hT), sinH = hT * cosH, k = cosH * hT / rg.tanP, a = (D - rg.ridgeHalf) * hT / rg.tanP;
    const ye = rg.topAt(0, side * D) ?? rg.eaveY;
    return {
      at: (v, t, h) => [t, ye + sinH * v + cosH * h, side * (D - cosH * v + sinH * h)], n: [0, cosH, side * sinH], up: [0, sinH, -side * cosH],
      along: [1, 0, 0], lim: (v) => Math.min(xe, a - k * v), upTo: (t) => (a - Math.abs(t)) / k, reach: (D - rg.ridgeHalf) / cosH, side, end, closes: true,
    };
  }
  const ye = rg.topAt(side * xe, 0) ?? rg.eaveY;
  const up: Vec3 = [-side * cosP, sinP, 0], n: Vec3 = [side * sinP, cosP, 0];
  // a side slope's hip edge: |z| = ridgeHalf + x tanP / hT at x in from the eave's edge, no further than the verge
  const k = cosP * rg.tanP / hT, a = rg.ridgeHalf + xe * rg.tanP / hT;
  return {
    at: (v, t, h) => [side * xe + up[0] * v + n[0] * h, ye + up[1] * v + n[1] * h, t], n, up, along: [0, 0, 1],
    lim: (v) => (hip ? Math.min(D, a - k * v) : D), upTo: (t) => (hip ? (a - Math.abs(t)) / k : Infinity),
    reach: (rg.kind === 'shed' ? 2 * rg.s + roof.eave : xe) / cosP, side, end, closes: hip,
  };
}

/** The canal tiles' cover rows a hand apart, the courses' lap up the slope (the Serranía's teja árabe, 45-50 cm long). */
const TILE_R = 0.075, TILE_COURSE = 0.4;
/** A cover row's section (along, off the covering) x TILE_R: a half-round in three facets, its feet bedded in the pans; the long view's in two. */
const ROLL3: ReadonlyArray<readonly [number, number]> = [[1, -0.15], [0.5, 0.72], [-0.5, 0.72], [-1, -0.15]];
const ROLL2: ReadonlyArray<readonly [number, number]> = [[1, -0.15], [0, 0.85], [-1, -0.15]];

/**
 * (dome-detail-275) One length of a cover row: the convex canal tiles laid butt over tail from `v0` to `v1` at `t`;
 * `mouth` its lower end open (dark at the eave, where the tiles' hollows show), `cap` its upper end closed.
 */
function coverRoll(sink: PartSink, sl: TileSlope, roll: ReadonlyArray<readonly [number, number]>, t: number, v0: number, v1: number, tone: number,
  mouth: number, cap: boolean): void {
  const ring = (v: number): Vec3[] => roll.map(([a, b]) => sl.at(v, t + a * TILE_R, b * TILE_R));
  const lo = ring(v0), hi = ring(v1), o: EmitOptions = { decor: true, shade: tone };
  for (let i = 0; i + 1 < roll.length; i++) {
    const a = (roll[i][0] + roll[i + 1][0]) / 2, b = (roll[i][1] + roll[i + 1][1]) / 2;
    facing(sink, 'roof', [lo[i], lo[i + 1], hi[i + 1], hi[i]], lerp3(sl.along, a, sl.n, b + 0.3), o);
  }
  if (mouth > 0) facing(sink, 'roof', lo, lerp3(sl.up, -1, sl.n, 0), { decor: true, shade: tone * mouth });
  if (cap) facing(sink, 'roof', hi, sl.up, o);
}

/**
 * (dome-detail-275) A course's butt across the pans: a step a finger high at `v`, thinning up the slope to the next;
 * `ends` closes its ends (a run's first and last length: the lengths between abut). Fine joinery.
 */
function courseStep(sink: PartSink, sl: TileSlope, v: number, t0: number, t1: number, tone: number, ends: readonly [boolean, boolean]): void {
  const len = TILE_COURSE * 1.1, b = 0.028;
  const l0 = sl.lim(v), l1 = sl.lim(v + len);
  const a0 = Math.max(t0, -l0), a1 = Math.min(t1, l0), c0 = Math.max(t0, -l1), c1 = Math.min(t1, l1);
  if (a1 - a0 < 0.2 || c1 - c0 < 0.05) return;
  const o: EmitOptions = { decor: true, fine: true, shade: tone };
  const A0 = sl.at(v, a0, -0.01), A1 = sl.at(v, a1, -0.01), B0 = sl.at(v, a0, b), B1 = sl.at(v, a1, b), C0 = sl.at(v + len, c0, -0.01), C1 = sl.at(v + len, c1, -0.01);
  facing(sink, 'roof', [A0, A1, B1, B0], lerp3(sl.up, -1, sl.n, 0), o);
  facing(sink, 'roof', [B0, B1, C1, C0], sl.n, o);
  if (ends[0] || a0 > t0 || c0 > t0) facing(sink, 'roof', [A0, B0, C0], lerp3(sl.along, -1, sl.n, 0), o);
  if (ends[1] || a1 < t1 || c1 < t1) facing(sink, 'roof', [A1, B1, C1], sl.along, o);
}

/**
 * (dome-detail-275; the work list: "a smooth roof"; the roof bar: the tiles in relief) The canal tiles (teja árabe) on
 * a gable, hip or shed roof: the cover rows down each slope a hand apart, each row its own tone of the sun-bleached clay
 * and its lichen, their mouths dark along the eave, run under the ridge or cut at the hip; a block of rows relaid in
 * newer, redder tiles; each course's butt a step across the pans. `pitch` the rows' spacing, `facets` the roll's (two
 * on a great roof seen from the square), `steps` the courses' butts. Left open (a hand clear all round) over the stripped
 * patch the war wear opened (HouseFrame.roofPatch).
 */
function canalTiles(sink: PartSink, frame: HouseFrame, look: () => number, opts: TileOptions = {}): void {
  // (the roof stands over the top storey's body: a jettied storey moves it off the house's middle)
  const b = frame.bodies[frame.bodies.length - 1], rx = (b.x0 + b.x1) / 2, rz = (b.z0 + b.z1) / 2;
  sink.placed(0, rx, 0, rz, () => canalTilesOn(sink, frame.roof, frame.spec.roof, frame.roofPatch, look, opts));
}

/**
 * pitch: the rows' spacing; facets: the roll's; steps: the courses' butts (`every` course, `whole`: one length across
 * the slope); hipEnds: the rolls' ends closed at a hip (hipCaps covers them); relaid: the block of newer tiles (false:
 * none, the church's budget; dome-detail-275, the roof sweep)
 */
interface TileOptions { pitch?: number; facets?: 2 | 3; steps?: boolean; every?: number; whole?: boolean; hipEnds?: boolean; relaid?: boolean }

/** (dome-detail-275, the roof sweep) the church's tiles at the 11,500 cap: the rolls in two facets a little wider apart, no butts or relaid block */
const CHURCH_TILES: TileOptions = { pitch: 0.47, facets: 2, steps: false, relaid: false };

/** (dome-detail-275) canalTiles on a roof laid without a house (a porch's lean-to: house.ts roofGeometry, emitRoof). */
function canalTilesOn(sink: PartSink, rg: HouseFrame['roof'], roof: RoofSpec, hole: HouseFrame['roofPatch'], look: () => number, opts: TileOptions = {}): void {
  const pad = 0.06;
  if (rg.kind !== 'gable' && rg.kind !== 'hip' && rg.kind !== 'shed') return;
  const pitch = opts.pitch ?? 0.25, roll = opts.facets === 2 ? ROLL2 : ROLL3;
  const cosP = 1 / Math.hypot(1, rg.tanP), xe = rg.s + roof.eave;
  const slopes = rg.kind === 'shed' ? [tileSlope(rg, roof, 1, false)] : [tileSlope(rg, roof, 1, false), tileSlope(rg, roof, -1, false)];
  if (rg.kind === 'hip' && rg.ridgeHalf < rg.halfD + (rg.hipVerge ?? roof.verge) - 0.05) slopes.push(tileSlope(rg, roof, 1, true), tileSlope(rg, roof, -1, true));
  for (const sl of slopes) {
    const top = rg.kind === 'shed' ? sl.reach - 0.04 : sl.reach - 0.1 / cosP;
    const gap = hole && !sl.end && hole.side === sl.side ? { v0: (xe - hole.x1 - pad) / cosP, v1: (xe - hole.x0 + pad) / cosP, t0: hole.z0 - pad, t1: hole.z1 + pad } : null;
    const L = sl.lim(0), span = 2 * L - 0.16;
    const rw = 0.8 + look() * 1.5, rv = look() * top * 0.55, rt = (look() - 0.5) * Math.max(0, span - rw);
    const relaid = look() < 0.75 && opts.relaid !== false ? { t0: rt - rw / 2, t1: rt + rw / 2, v0: rv, v1: rv + 0.9 + look() * 1.3 } : null;
    const n = Math.max(2, Math.round(span / pitch));
    for (let k = 0; k < n; k++) {
      const t = -L + 0.08 + (k + 0.5) * span / n + (look() - 0.5) * 0.024, tone = 0.8 + look() * 0.24;
      const vEnd = sl.closes ? Math.min(top, sl.upTo(Math.abs(t) + TILE_R)) : top;
      if (vEnd < 0.3) continue;
      const spans: Array<[number, number]> = gap && t + TILE_R > gap.t0 && t - TILE_R < gap.t1 ? [[-0.05, Math.min(vEnd, gap.v0)], [gap.v1, vEnd]] : [[-0.05, vEnd]];
      for (const [a, b] of spans) {
        if (b - a < 0.2) continue;
        // the row's lengths: its own tone, a relaid block's brighter tiles across it
        const cuts = relaid && t > relaid.t0 && t < relaid.t1 ? [a, Math.min(b, Math.max(a, relaid.v0)), Math.min(b, Math.max(a, relaid.v1)), b] : [a, b];
        const pieces: Array<[number, number, number]> = [];
        for (let i = 0; i + 1 < cuts.length; i++) if (cuts[i + 1] - cuts[i] > 0.05) pieces.push([cuts[i], cuts[i + 1], cuts.length > 2 && i === 1 ? 1.12 : tone]);
        pieces.forEach(([p0, p1, tn], i) => coverRoll(sink, sl, roll, t, p0, p1, tn, i ? 0 : a < 0 ? 0.42 : 0.7,
          i === pieces.length - 1 && p1 < top - 0.01 && (opts.hipEnds !== false || p1 < vEnd - 0.01)));
      }
    }
    if (opts.steps === false) continue;
    // the courses' butts across the pans, a few metres a length, left out over the patch
    for (let v = TILE_COURSE + 0.04; v < top - 0.3; v += TILE_COURSE * (opts.every ?? 1)) {
      const lv = sl.lim(v), len = TILE_COURSE * 1.1;
      const runs: Array<[number, number]> = gap && v + len > gap.v0 && v < gap.v1 ? [[-lv, gap.t0], [gap.t1, lv]] : [[-lv, lv]];
      for (const [c0, c1] of runs) {
        for (let t = c0; t < c1 - 0.2;) {
          const w = opts.whole ? c1 - t : Math.min(c1 - t, 2.2 + look() * 2.4);
          courseStep(sink, sl, v + (look() - 0.5) * 0.03, t, t + w, 0.84 + look() * 0.18, [t === c0, t + w >= c1]);
          t += w;
        }
      }
    }
  }
}

/**
 * (dome-detail-275) The cap tiles (limas) bedded down a hip roof's four hips, from the ridge's ends to the eave's
 * corners: a half-round of tiles proud of the slopes, the mortar's grey at their feet.
 */
function hipCaps(sink: PartSink, frame: HouseFrame): void {
  const rg = frame.roof, roof = frame.spec.roof;
  if (rg.kind !== 'hip') return;
  const tb = frame.bodies[frame.bodies.length - 1];
  sink.placed(0, (tb.x0 + tb.x1) / 2, 0, (tb.z0 + tb.z1) / 2, () => hipCapsAt(sink, rg, roof));
}

function hipCapsAt(sink: PartSink, rg: HouseFrame['roof'], roof: RoofSpec): void {
  const xe = rg.s + roof.eave, ze = rg.halfD + (rg.hipVerge ?? roof.verge);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const a: Vec3 = [0, rg.ridgeTopY + 0.04, sz * rg.ridgeHalf];
    const b: Vec3 = [sx * xe, (rg.topAt(sx * (xe - 0.02), sz * (ze - 0.02)) ?? rg.eaveY) + 0.04, sz * ze];
    // its out square to the hip, upward
    const ay = normalize3(sub3(b, a)), ax = normalize3(cross3(ay, [0, 1, 0]));
    let out = normalize3(cross3(ax, ay));
    if (out[1] < 0) out = [-out[0], -out[1], -out[2]];
    sink.member('roof', a, b, 0.22, 0.12, out, { decor: true, shadow: true, ends: true }, 0.03);
  }
}

/**
 * The parish church (dome-detail-275, rebuilt; the audit: "blank apse and transept walls, a few small windows on a 24 m
 * nave"): a hall nave limewashed over its rubble on a stone plinth, stepped buttresses down its flanks under dressed
 * stone weatherings, round-headed high windows in stone rings behind their grilles, a moulded stone cornice under the
 * tile eave (alero) and the ridge's cap tiles, a stone cross on the east gable; on the south flank the Renaissance side
 * portal in the gorge's golden stone, an old door walled up on the north. At the head the lower capilla mayor with its
 * corner buttresses, its high lights and the tiled shrine on its east wall, the sacristy's lean-to on one flank. The
 * belfry tower over the west door at the street end, limewashed between ashlar quoins: the main portal of columns,
 * entablature, niche and pediment, the oculus over it, the clock; the bell stage's arches between pilasters, its bells
 * on oak yokes; the cornice and its pinnacles with glazed balls (a stork's nest on one corner of most towers), the
 * octagonal stage and its spire of glazed tile, the iron cross. Before it the lonja: the raised forecourt on its
 * whitewashed retaining wall, its parapets and steps, the cross on its column and an orange tree. The damp's tide and
 * the render's losses at every wall foot.
 */
const iglesia: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const look = ctx.variant;
  const W = clamp(ctx.info.w - 2.0, 6.5, 8.8), zF = ctx.info.d / 2, fl = 0.6;
  const T = clamp(W * 0.56, 4.0, 4.6), half = T / 2;
  const zTF = zF - 2.1, zt0 = zTF - T, tz = zt0 + half;
  // (the chancel's east wall stands its buttresses' reach and 0.35 m short of the plot's end: every solid inside the plot)
  const east = 1.05, nz1 = zt0 + 0.4, nave = clamp(nz1 + zF - east - 4.6, 9, 16), nz0 = nz1 - nave;
  const cLen = Math.max(3.4, nz0 + zF - east);
  const naveH = 8.6, pitch = 28, bay = nave / 4;
  const leaf = shade(rgb(0x6a4a30), 0.9 + look() * 0.2);
  const glaze = look() < 0.5 ? AZ_GREEN : AZ_BLUE;
  const win = (face: 'left' | 'right', u: number): Opening => ({ face, storey: 0, kind: 'window', u, w: 0.85, y0: 5.0, h: 1.45, arch: {} });
  const openings: Opening[] = [
    ...[-1.5, -0.5, 0.5, 1.5].map((k) => win('left', k * bay)),
    ...[-1.5, 1.5].map((k) => win('right', k * bay)),
    { face: 'right', storey: 0, kind: 'door', u: 0, w: 1.5, y0: 0, h: 2.45, arch: {} },
  ];
  // the high lights: round-headed in a ring of voussoirs between dressed jambs, the glass in the reveal, an iron grille
  const glazing: WindowStyle = { frame: rgb(0x3a3430), frameWidth: 0.05, frameOut: 0.03, bars: 'none', surround: null, sill: { bucket: 'stone', out: 0.1 }, shutters: null };
  const church: HouseDialect = {
    window: (s, face, o, y0) => {
      const y = y0 + o.y0, r = o.w / 2;
      windowUnit(s, face, o.u, y, o.w, o.h, glazing, st.rng, 0.3);
      archGlazing(s, face, o.u, y + o.h, r, glazing.frame);
      archHead(s, face, o.u, y + o.h, r, 'stone', 0.2, 7);
      for (const e of [-1, 1]) faceBox(s, 'stone', face, o.u + e * (r + 0.1), y + o.h / 2, 0.015, 0.2, o.h, 0.03, { decor: true }, { back: true });
      // (dome-detail-275, the roof sweep's triangle trade: the high grilles' bars a hand and a half apart)
      rejilla(s, face, o.u, y, o.w, o.h, 0.19);
    },
    door: (s, face, o, y0) => {
      doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf, frame: { bucket: 'stone', width: 0.05, out: 0.01 }, steps: { bucket: 'stone' }, leafKind: 'plank' }, y0 + o.y0);
      fanLeaf(s, face, o.u, y0 + o.y0 + o.h, o.w / 2, leaf);
    },
  };
  // ---- the nave
  // (dome-detail-275, the roof sweep) the nave's and the capilla's frames, their tiles laid last (the look stream as it was)
  const roofs: HouseFrame[] = [];
  sink.placed(0, 0, 0, (nz0 + nz1) / 2, () => {
    const frame = buildHouse(sink, {
      w: W, d: nave, plinth: { h: fl, out: 0.08, bucket: 'stone' }, storeys: [{ h: naveH, wall: 'plaster' }],
      roof: canal(pitch, 0.38, 0.14), gableBucket: 'plaster', openings, chimneys: [], gutters: null, verge: null, spall: 'stone', reveal: 0.5, core: 'rubble',
    }, church);
    roofs.push(frame);
    const eave = frame.eaveY, right = frame.faces.right, left = frame.faces.left, front = frame.faces.front;
    // the tile eave and the ridge's cap tiles over a moulded stone cornice down both flanks
    alero(sink, frame);
    for (const s of [-1, 1]) {
      sink.span('stone', s * W / 2, eave - 0.52, -nave / 2 - 0.16, s * (W / 2 + 0.16), eave - 0.25, nave / 2 + 0.16, { decor: true, shadow: true });
      sink.span('stone', s * W / 2, eave - 0.64, -nave / 2 - 0.07, s * (W / 2 + 0.07), eave - 0.52, nave / 2 + 0.07, { decor: true });
    }
    // the buttresses at the bays' ends down both flanks (none in the middle of the south one: the portal)
    for (let k = 0; k <= 4; k++) {
      const z = clamp(-nave / 2 + k * bay, -nave / 2 + 0.45, nave / 2 - 0.45);
      if (k !== 2) contrafuerte(sink, right, -z, eave - 2.5 + look() * 0.4, 0.8, 0.85, look);
      contrafuerte(sink, left, z, eave - 2.5 + look() * 0.4, 0.8, 0.85, look);
    }
    const phw = portada(sink, right, 0, fl, 1.5, 2.45, false);
    // ashlar quoins up the west front's corners beside the tower
    for (const s of [-1, 1]) quoinsAt(sink, s * W / 2, nave / 2, s, 1, fl, eave - 0.7);
    // an old door walled up in one bay of the north flank: its jambs and arch left standing in the lime, the blocking's
    // stone showing where the render has gone
    const bu = (look() < 0.5 ? -0.5 : 0.5) * bay, bw = 1.3, bs = fl + 2.1;
    for (const e of [-1, 1]) faceBox(sink, 'stone', left, bu + e * (bw / 2 + 0.1), (fl + bs) / 2, 0.015, 0.2, bs - fl, 0.03, { decor: true }, { back: true });
    archHead(sink, left, bu, bs, bw / 2, 'stone', 0.2, 7);
    const fill: Vec3[] = [facePoint(left, bu - bw / 2, fl, 0.013), facePoint(left, bu + bw / 2, fl, 0.013)];
    for (let i = 0; i <= 7; i++) { const a = Math.PI * i / 7; fill.push(facePoint(left, bu + Math.cos(a) * bw / 2, bs + Math.sin(a) * bw / 2, 0.013)); }
    sink.polygon('stone', fill, { decor: true, shade: 0.8, tint: [0.96, 0.93, 0.88] });
    // the damp at the walls' foot
    dampFoot(sink, left, -nave / 2 + 0.1, nave / 2 - 0.1, fl, look, 3);
    dampFoot(sink, right, -nave / 2 + 0.1, -phw - 0.1, fl, look, 1);
    dampFoot(sink, right, phw + 0.1, nave / 2 - 0.1, fl, look, 1);
    for (const s of [-1, 1]) dampFoot(sink, front, s > 0 ? half + 0.05 : -W / 2 + 0.05, s > 0 ? W / 2 - 0.05 : -half - 0.05, fl, look, 0);
    // the stone cross on the east gable's apex
    const ry = frame.roof.ridgeTopY, bz = -nave / 2;
    sink.span('stone', -0.22, ry - 0.3, bz - 0.12, 0.22, ry + 0.22, bz + 0.26, { decor: true });
    sink.span('stone', -0.07, ry + 0.22, bz - 0.03, 0.07, ry + 1.3, bz + 0.11, { decor: true, shadow: true });
    sink.span('stone', -0.34, ry + 0.86, bz - 0.03, 0.34, ry + 0.99, bz + 0.11, { decor: true, shadow: true });
  });
  // ---- the capilla mayor at the head, lower, under a hipped roof
  const cw = W - 0.6, cd = cLen + 0.4;
  const sac = look() < 0.5 ? 1 : -1;
  const cOpen: Opening[] = [
    { face: 'right', storey: 0, kind: 'window', u: 0.3, w: 0.8, y0: 4.3, h: 1.3, arch: {} },
    { face: 'left', storey: 0, kind: 'window', u: -0.3, w: 0.8, y0: 4.3, h: 1.3, arch: {} },
    { face: 'back', storey: 0, kind: 'window', u: 0, w: 0.6, y0: 4.6, h: 0.9, arch: {} },
  ];
  sink.placed(0, 0, 0, nz0 - cLen / 2 + 0.2, () => {
    const cf = buildHouse(sink, {
      w: cw, d: cd, plinth: { h: fl, out: 0.08, bucket: 'stone' }, storeys: [{ h: naveH - 1.2, wall: 'plaster' }],
      roof: canal(30, 0.35, 0.35, 'hip'), gableBucket: 'plaster', openings: cOpen, chimneys: [], gutters: null, verge: null, spall: 'stone', reveal: 0.45, core: 'rubble',
    }, church);
    roofs.push(cf);
    const ce = cf.eaveY, b = cf.bodies[0], back = cf.faces.back;
    // its tile eave round the three free sides over the stone cornice
    alero(sink, cf);
    sink.span('roof', b.x0 - 0.06, ce - 0.12, b.z0, b.x1 + 0.06, ce, b.z0 - 0.2, { decor: true, shadow: true });
    sink.span('plaster', b.x0 - 0.03, ce - 0.25, b.z0, b.x1 + 0.03, ce - 0.12, b.z0 - 0.1, { decor: true, shadow: true });
    for (const s of [-1, 1]) sink.span('stone', s * cw / 2, ce - 0.52, b.z0 - 0.16, s * (cw / 2 + 0.16), ce - 0.25, b.z1, { decor: true, shadow: true });
    sink.span('stone', b.x0 - 0.16, ce - 0.52, b.z0, b.x1 + 0.16, ce - 0.25, b.z0 - 0.16, { decor: true, shadow: true });
    // a pair of buttresses at each east corner, the quoins over them
    for (const s of [-1, 1]) {
      contrafuerte(sink, back, s * (cw / 2 - 0.45), ce - 2.2 + look() * 0.3, 0.64, 0.8, look);
      contrafuerte(sink, s > 0 ? cf.faces.right : cf.faces.left, s * (cd / 2 - 0.45), ce - 2.2 + look() * 0.3, 0.72, 0.8, look);
      quoinsAt(sink, s * cw / 2, b.z0, s, -1, ce - 1.2, ce - 0.55);
    }
    retablo(sink, back, 0, fl + 1.75, look);
    for (const f of [back, cf.faces.right, cf.faces.left]) dampFoot(sink, f, -f.width / 2 + 0.1, f.width / 2 - 0.1, fl, look, 1);
    // the sacristy's lean-to against one flank: limewashed, a door and a grilled light under a box reja, its tiles
    // falling outward, the triangles under them walled
    const xi = sac * (cw / 2 - 0.05), xo = sac * (ctx.info.w / 2 - 0.3), xe = sac * (ctx.info.w / 2 - 0.06), za = -cd / 2 + 1.05, zb = cd / 2 - 0.45, sh = 3.4;
    const sacHoles = [{ u0: -0.95, u1: -0.05, y0: 0.12, y1: 2.2 }, { u0: 0.45, u1: 1.1, y0: 1.35, y1: 2.25 }];
    const sf = holedBox(sink, 'plaster', Math.min(xi, xo), za, Math.max(xi, xo), zb, -0.4, sh, sac > 0 ? { right: sacHoles } : { left: sacHoles }, 0.3, 0.25);
    const of = sac > 0 ? sf.right : sf.left;
    sink.recess = 0.25;
    try {
      doorUnit(sink, of, -0.5, 0.12, 0.9, 2.08, { leaf: shade(leaf, 1.12), frame: { bucket: 'stone', width: 0.14, out: 0.04 }, steps: { bucket: 'stone' }, leafKind: 'panel' }, 0.12);
      windowUnit(sink, of, 0.775, 1.35, 0.65, 0.9, glazing, st.rng, 0.3);
    } finally { sink.recess = 0; }
    reja(sink, of, 0.775, 1.35, 0.65, 0.9, true);
    const hiU = sh + 0.5, loU = sh - 0.5 * Math.abs(xe - xo) / Math.abs(xo - xi);
    prismAuto(sink, 'roof', [[xi, hiU, za - 0.25], [xe, loU, za - 0.25], [xe, loU + 0.16, za - 0.25], [xi, hiU + 0.16, za - 0.25]], [0, 0, 1], zb - za + 0.27, { shadow: true });
    for (const [z, d] of [[za, 1], [zb, -1]] as const) prismAuto(sink, 'plaster', [[xi, sh, z], [xo, sh, z], [xi, hiU, z]], [0, 0, d], 0.3, {});
    dampFoot(sink, of, 0.05, of.width / 2 - 0.1, 0, look, 0);
  });
  // ---- the tower over the west door: limewashed between ashlar quoins on a stone socle, the door and the oculus over
  // it cut through the shaft (the leaf at the back of the door's reveal), slits for the stair in its flanks
  const shaftTop = 12.6, tRev = 0.36, dw = 1.7, dSpring = 2.85, ocY = 9.55;
  sink.span('stone', -half - 0.14, -0.4, zt0 - 0.14, half + 0.14, fl + 0.06, zTF + 0.14);
  const slits = [{ u0: -0.14, u1: 0.14, y0: 5.4, y1: 6.3 }, { u0: -0.14, u1: 0.14, y0: 9.2, y1: 10.1 }];
  const tfs = holedBox(sink, 'plaster', -half, zt0, half, zTF, fl, shaftTop, {
    front: [{ u0: -dw / 2, u1: dw / 2, y0: fl, y1: fl + dSpring + dw / 2, spring: fl + dSpring }, { u0: -0.5, u1: 0.5, y0: ocY - 0.5, y1: ocY + 0.5 }],
    right: slits, left: slits,
  }, 0.4, tRev);
  const tf = tfs.front;
  sink.recess = tRev;
  try {
    doorUnit(sink, tf, 0, fl, dw, dSpring, { leaf, frame: { bucket: 'stone', width: 0.05, out: 0.01 }, steps: null, leafKind: 'plank' }, fl);
    fanLeaf(sink, tf, 0, fl + dSpring, dw / 2, leaf);
  } finally { sink.recess = 0; }
  portada(sink, tf, 0, fl, dw, dSpring, true);
  // the oculus lighting the choir: its ring of voussoirs round the cut, the glass at the reveal's back behind an iron cross
  for (let i = 0; i < 12; i++) {
    const a0 = i / 12 * Math.PI * 2, a1 = (i + 1) / 12 * Math.PI * 2, rr = 0.65;
    sink.member('stone', facePoint(tf, Math.cos(a0) * rr, ocY + Math.sin(a0) * rr, 0), facePoint(tf, Math.cos(a1) * rr, ocY + Math.sin(a1) * rr, 0), 0.28, 0.12, tf.out,
      { decor: true, ends: true, ...(i % 2 ? { shade: 0.92 } : {}) }, 0.01);
  }
  const disc: Vec3[] = [];
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; disc.push(facePoint(tf, Math.cos(a) * 0.52, ocY + Math.sin(a) * 0.52, -tRev + 0.03)); }
  sink.polygon('glass', disc, { decor: true });
  for (const [su, sy] of [[0.04, 1.02], [1.02, 0.04]] as const) faceBox(sink, 'structureMetal', tf, 0, ocY, -tRev + 0.05, su, sy, 0.03, { colour: IRON, decor: true });
  // the slits' dressed surrounds; a string course; the clock under the bell stage
  for (const fc of [tfs.right, tfs.left]) for (const sl of slits) {
    for (const e of [-1, 1]) faceBox(sink, 'stone', fc, e * 0.22, (sl.y0 + sl.y1) / 2, 0.02, 0.16, sl.y1 - sl.y0 + 0.16, 0.04, { decor: true }, { back: true });
    for (const e of [-1, 1]) faceBox(sink, 'stone', fc, 0, e > 0 ? sl.y1 + 0.06 : sl.y0 - 0.06, 0.025, 0.6, 0.12, 0.05, { decor: true }, { back: true });
  }
  for (const fc of [tfs.right, tfs.left]) dampFoot(sink, fc, -half + 0.05, half - 0.05, fl, look, 1);
  sink.band('stone', -half - 0.07, 10.5, zt0 - 0.07, half + 0.07, 10.7, zTF + 0.07, { decor: true });
  const ck = facePoint(tf, 0, 11.6, 0);
  // (dome-detail-275, the roof sweep's triangle trade: twelve sides, the clock 0.6 m across)
  sink.cylinder('stone', ck, 'z', 0.1, 0.62, 12, { decor: true });
  sink.cylinder('structureMetal', [ck[0], ck[1], ck[2] + 0.1], 'z', 0.02, 0.52, 12, { colour: AZ_WHITE, decor: true });
  for (let h = 0; h < 4; h++) {
    const a = h / 4 * Math.PI * 2;
    faceBox(sink, 'structureMetal', tf, Math.sin(a) * 0.42, 11.6 + Math.cos(a) * 0.42, 0.125, 0.06, 0.12, 0.01, { colour: IRON, decor: true }, { back: true });
  }
  faceBox(sink, 'structureMetal', tf, 0, 11.77, 0.13, 0.035, 0.36, 0.01, { colour: IRON, decor: true });
  faceBox(sink, 'structureMetal', tf, 0.11, 11.56, 0.13, 0.24, 0.04, 0.01, { colour: IRON, decor: true });
  // the quoins (at the back, over the nave's roof)
  const overRoof = fl + naveH + (W / 2 - half) * Math.tan(pitch * Math.PI / 180) + 0.3;
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]] as const) quoinsAt(sink, sx * half, sz > 0 ? zTF : zt0, sx, sz, sz > 0 ? fl + 0.06 : overRoof, shaftTop - 0.1);
  // ---- the bell stage: its floor and sill course over the shaft's cornice, four corner piers, a round arch on each face
  // in its voussoirs between two pilasters, the imposts and keystone; a bell on its oak yoke in each arch
  sink.band('stone', -half - 0.16, shaftTop - 0.05, zt0 - 0.16, half + 0.16, shaftTop + 0.16, zTF + 0.16, { decor: true, shadow: true });
  sink.band('stone', -half - 0.08, shaftTop + 0.16, zt0 - 0.08, half + 0.08, shaftTop + 0.3, zTF + 0.08, { decor: true });
  const sill = shaftTop + 0.85, ow = 2.0, p = (T - ow) / 2, spring = sill + 1.6, rise = ow / 2 * 0.95, top = spring + rise + 0.3, y1 = top + 0.55;
  sink.span('plaster', -half, shaftTop, zt0, half, sill, zTF);
  sink.band('stone', -half - 0.07, sill - 0.12, zt0 - 0.07, half + 0.07, sill, zTF + 0.07, { decor: true, shadow: true });
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    // (dome-detail-275, the roof sweep's triangle trade) the pier's bed and head buried in the stage under and over it
    const x0 = sx > 0 ? half - p : -half, x1 = sx > 0 ? half : -half + p, z0 = sz > 0 ? zTF - p : zt0, z1 = sz > 0 ? zTF : zt0 + p;
    sink.box('plaster', [(x0 + x1) / 2, (sill + top) / 2, (z0 + z1) / 2], [(x1 - x0) / 2, (top - sill) / 2, (z1 - z0) / 2], {}, undefined, { py: true, ny: true });
  }
  sink.span('plaster', -half, top, zt0, half, y1, zTF);
  const faces: Face[] = [
    { origin: [0, 0, zTF], u: [1, 0, 0], out: [0, 0, 1], width: T },
    { origin: [0, 0, zt0], u: [-1, 0, 0], out: [0, 0, -1], width: T },
    { origin: [half, 0, tz], u: [0, 0, -1], out: [1, 0, 0], width: T },
    { origin: [-half, 0, tz], u: [0, 0, 1], out: [-1, 0, 0], width: T },
  ];
  faces.forEach((fc, k) => {
    archFill(sink, fc, 0, ow / 2, spring, rise, top, 0.45, 'plaster', 'stone', true, 7, true);
    faceBox(sink, 'stone', fc, 0, spring + rise + 0.16, 0.06, 0.3, 0.4, 0.12, { decor: true });
    for (const s of [-1, 1]) {
      const pu = s * (ow / 2 + p / 2);
      faceBox(sink, 'stone', fc, pu, (sill + top) / 2, 0.03, 0.46, top - sill, 0.06, { decor: true }, { back: true });
      faceBox(sink, 'stone', fc, pu, top - 0.09, 0.06, 0.6, 0.18, 0.12, { decor: true });
      faceBox(sink, 'stone', fc, s * (ow / 2 + 0.14), spring - 0.07, 0.05, 0.3, 0.14, 0.1, { decor: true });
    }
    const axle = spring + 0.2, br = (k < 2 ? 0.48 : 0.34) + look() * 0.06;
    campana(sink, fc, 0, axle, -p * 0.55, br);
    faceBox(sink, 'structureMetal', fc, 0, axle, -p * 0.55, ow + 0.16, 0.07, 0.07, { colour: IRON, decor: true }, 'ends');
  });
  // its cornice; the corner pinnacles with their glazed balls (a stork's nest on one corner of most towers instead: the
  // nest is dressing, the pinnacle's plinth stands on every tier)
  sink.band('stone', -half - 0.12, y1, zt0 - 0.12, half + 0.12, y1 + 0.2, zTF + 0.12, { decor: true });
  sink.span('stone', -half - 0.24, y1 + 0.2, zt0 - 0.24, half + 0.24, y1 + 0.38, zTF + 0.24, { shadow: true });
  const ct = y1 + 0.38;
  const nestDraw = look(), nestSide = look();
  const nest = nestDraw < 0.6 ? (nestSide < 0.5 ? 0 : 1) : -1;
  ([[-1, 1], [1, 1], [-1, -1], [1, -1]] as const).forEach(([sx, sz], k) => {
    const px = sx * (half - 0.08), pz = tz + sz * (half - 0.08);
    sink.box('stone', [px, ct + 0.21, pz], [0.22, 0.21, 0.22], {}, undefined, { ny: true });
    if (k === nest) {
      sink.dressing(st.mobile, () => sink.cylinder('structureWood', [px - sx * 0.2, ct + 0.42, pz - sz * 0.2], 'y', 0.42, 0.62, 8,
        { colour: rgb(0x5a4a36), decor: true, shadow: true }, 0.72));
      return;
    }
    pinaculo(sink, [px, ct + 0.42, pz], 1.4, glaze);
  });
  // the octagonal stage: limewashed on a stone base course, a pilaster at each angle, a little arched light on four
  // faces, its stepped cornice
  const rc = 1.42, oy1 = ct + 1.4, ph = Math.PI / 8;
  // (the roof sweep's triangle trade: its bed on the cornice and its head under the stone course, no caps)
  sink.cylinder('plaster', [0, ct, tz], 'y', oy1 - ct, rc, 8, {}, rc, false, ph);
  sink.cylinder('stone', [0, ct, tz], 'y', 0.26, rc + 0.08, 8, { decor: true }, rc + 0.08, true, ph);
  for (let k = 0; k < 8; k++) {
    const th = k * Math.PI / 4, out: Vec3 = [Math.cos(th), 0, Math.sin(th)], ap = rc * Math.cos(ph), side = 2 * rc * Math.sin(ph);
    const f: Face = { origin: [out[0] * ap, 0, tz + out[2] * ap], u: [out[2], 0, -out[0]], out, width: side };
    for (const e of [-1, 1]) faceBox(sink, 'stone', f, e * (side / 2 - 0.07), (ct + oy1) / 2, 0.02, 0.14, oy1 - ct - 0.1, 0.04, { decor: true }, { back: true });
    if (k % 2) continue;
    const lw = 0.36, l0 = ct + 0.4, l1 = oy1 - 0.3;
    const slot: Vec3[] = [facePoint(f, -lw / 2, l0, 0.01), facePoint(f, lw / 2, l0, 0.01)];
    for (let i = 0; i <= 5; i++) { const t = i / 5 * Math.PI; slot.push(facePoint(f, Math.cos(t) * lw / 2, l1 - lw / 2 + Math.sin(t) * lw / 2, 0.01)); }
    sink.polygon('dark', slot, { decor: true });
    archHead(sink, f, 0, l1 - lw / 2, lw / 2, 'stone', 0.1, 5);
  }
  sink.cylinder('stone', [0, oy1, tz], 'y', 0.12, rc + 0.1, 8, {}, rc + 0.1, true, ph);
  sink.cylinder('stone', [0, oy1 + 0.12, tz], 'y', 0.12, rc + 0.2, 8, {}, rc + 0.2, true, ph);
  // the spire (chapitel) of glazed tile: eight faces drawn in a little to a concave point, a course of green at its eave,
  // the cobalt and white tiles in a chequer up it, the ochre at its tip; the iron cross on its ball
  const sb = oy1 + 0.24, sh = 3.3, r0 = rc + 0.16, bands = 6;
  const vert = (k: number, t: number): Vec3 => {
    const a = ph + k * Math.PI / 4, rr = r0 * Math.pow(1 - t, 1.35);
    return [Math.cos(a) * rr, sb + sh * t, tz + Math.sin(a) * rr];
  };
  for (let j = 0; j < bands; j++) for (let k = 0; k < 8; k++) {
    const t0 = j / bands, t1 = (j + 1) / bands;
    const pts = j === bands - 1 ? [vert(k, t0), vert(k + 1, t0), vert(k, t1)] : [vert(k, t0), vert(k + 1, t0), vert(k + 1, t1), vert(k, t1)];
    const c = pts.reduce<Vec3>((m, q) => [m[0] + q[0] / pts.length, m[1] + q[1] / pts.length, m[2] + q[2] / pts.length], [0, 0, 0]);
    const outward = dot3(cross3(sub3(pts[1], pts[0]), sub3(pts[2], pts[0])), [c[0], 0, c[2] - tz]) > 0;
    const tile = j === 0 ? AZ_GREEN : j === bands - 1 ? AZ_OCHRE : (j + k) % 2 ? AZ_BLUE : AZ_WHITE;
    sink.polygon('structureMetal', outward ? pts : pts.reverse(), { colour: shade(tile, 0.94 + look() * 0.1), shadow: true });
  }
  finialOn(sink, 0, sb + sh - 0.05, tz, 1.1, IRON, 'cross');
  recordShaft(sink, 0, tz, T, sb + sh + 1.3, 'stone');
  // ---- the lonja: the raised forecourt before the west door on its limewashed retaining wall (its foot in the slope,
  // greyed by the damp), paved in stone with a coping lip, low parapets with stone copings, the steps up from the street
  // between two stone pillars and their balls, a path of dressed slabs to the door; the cross on its column on one side
  // of the tower, an orange tree in its kerb on the other
  const lx = ctx.info.w / 2 - 0.1, lz0 = nz1 - 0.05, lz1 = zF - 0.45;
  sink.span('plaster', -lx + 0.04, -0.8, lz0, lx - 0.04, fl - 0.14, lz1 - 0.04, { shadeAt: (q: Vec3) => clamp(0.8 + 0.2 * (q[1] + 0.2) / 0.7, 0.8, 1) });
  sink.span('stone', -lx, fl - 0.14, lz0, lx, fl, lz1);
  const parapet = (x0: number, z0: number, x1: number, z1: number): void => {
    sink.span('plaster', x0, fl, z0, x1, fl + 0.5, z1);
    sink.span('stone', x0 - 0.04, fl + 0.5, z0 - 0.04, x1 + 0.04, fl + 0.58, z1 + 0.04, { decor: true });
  };
  for (const s of [-1, 1]) {
    parapet(s > 0 ? lx - 0.28 : -lx, lz0 + 0.9, s > 0 ? lx : -lx + 0.28, lz1);
    parapet(s > 0 ? 2.2 : -lx, lz1 - 0.28, s > 0 ? lx - 0.28 : -2.2, lz1);
    sink.span('stone', s * 1.8, fl - 0.14, lz1 - 0.38, s * 2.2, fl + 0.78, lz1 + 0.02);
    sink.revolve('stone', [s * 2.0, fl + 0.78, lz1 - 0.18], 'y', [[0, 0.12], [0.08, 0.06], [0.22, 0.13], [0.36, 0]], 6, { decor: true });
  }
  for (let k = 1; k <= 2; k++) sink.span('stone', -1.75, -0.3, lz1 - 0.02, 1.75, fl - 0.2 * k, lz1 + 0.33 * k, { decor: true, shadow: true });
  sink.span('stone', -0.95, fl, zTF + 0.05, 0.95, fl + 0.012, lz1 - 0.02, { decor: true, shade: 0.88 });
  const cs = look() < 0.5 ? 1 : -1, sideZ = (nz1 + zTF) / 2 + 0.4, sideX = (half + lx) / 2;
  const kx = cs * sideX;
  sink.span('stone', kx - 0.5, fl, sideZ - 0.5, kx + 0.5, fl + 0.28, sideZ + 0.5, { decor: true, shadow: true });
  sink.span('stone', kx - 0.34, fl + 0.28, sideZ - 0.34, kx + 0.34, fl + 0.56, sideZ + 0.34, { decor: true, shadow: true });
  columna(sink, [kx, fl + 0.56, sideZ], 2.1, 0.1);
  const kt = fl + 0.56 + 2.1;
  sink.span('stone', kx - 0.06, kt, sideZ - 0.06, kx + 0.06, kt + 0.95, sideZ + 0.06, { decor: true, shadow: true });
  sink.span('stone', kx - 0.34, kt + 0.55, sideZ - 0.06, kx + 0.34, kt + 0.67, sideZ + 0.06, { decor: true, shadow: true });
  const ox = -cs * sideX;
  sink.span('stone', ox - 0.55, fl, sideZ - 0.55, ox + 0.55, fl + 0.14, sideZ + 0.55, { decor: true });
  sink.cylinder('structureWood', [ox, fl + 0.1, sideZ], 'y', 1.5, 0.1, 7, { colour: rgb(0x5a4632), decor: true, shadow: true }, 0.08);
  sink.revolve('structureWood', [ox, fl + 1.25, sideZ], 'y', [[0, 0.2], [0.15, 0.55], [0.45, 0.74], [0.8, 0.72], [1.2, 0.45], [1.4, 0]], 8,
    { colour: shade(LEAF, 0.85 + look() * 0.2), decor: true, shadow: true });
  // (dome-detail-275, the roof sweep's triangle trade: three oranges, not five)
  for (let k = 0; k < 3; k++) {
    // (the fruit set into the crown's skin where it is widest, never standing off it)
    const a = look() * Math.PI * 2, y = fl + 1.25 + 0.45 + look() * 0.35;
    sink.box('structureWood', [ox + Math.cos(a) * 0.72, y, sideZ + Math.sin(a) * 0.72], [0.05, 0.05, 0.05], { colour: rgb(0xe08a2a), decor: true, fine: true });
  }
  // (dome-detail-275, the roof sweep) the canal tiles in relief on the nave and down the capilla's hips
  sink.placed(0, 0, 0, (nz0 + nz1) / 2, () => canalTiles(sink, roofs[0], look, CHURCH_TILES));
  sink.placed(0, 0, 0, nz0 - cLen / 2 + 0.2, () => canalTiles(sink, roofs[1], look, { ...CHURCH_TILES, pitch: 0.5, hipEnds: false }));
  sink.placed(0, 0, 0, nz0 - cLen / 2 + 0.2, () => hipCaps(sink, roofs[1]));
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
  // (props census #5) the door through the battered foot and the horseshoe window through the shaft (both were dark
  // plates on solid spans), the dark of the stair behind them; the tower recorded as a shaft body
  const wy = H * 0.6;
  holedBox(sink, 'stone', -h - 0.2, -h - 0.2, h + 0.2, h + 0.2, 0.4, 2.2, { front: [{ u0: -0.45, u1: 0.45, y0: 0.4, y1: 1.95 }] }, 0.4, 0.34);
  holedBox(sink, 'stone', -h, -h, h, h, 2.2, H, { front: [{ u0: -0.31, u1: 0.31, y0: wy - 0.575, y1: wy + 0.575 }] }, 0.4, 0.34);
  recordShaft(sink, 0, 0, S, H + 0.85, 'stone');
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    for (let y = 2.3, k = 0; y < H - 0.6; y += 0.5, k++) {
      const lx = k % 2 ? 0.55 : 0.3, lz = k % 2 ? 0.3 : 0.55;
      sink.quoin('stone', sx * h - sx * lx, y, sz * h - sz * lz, sx * h + sx * 0.03, y + 0.44, sz * h + sz * 0.03, sx, sz, { decor: true });
    }
  }
  const front: Face = { origin: [0, 0, h], u: [1, 0, 0], out: [0, 0, 1], width: S };
  // the small door's lintel at the foot and the horseshoe window's frame
  faceBox(sink, 'stone', front, 0, 2.05, 0.28, 1.25, 0.24, 0.16, { decor: true });
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
 * arched opening and its bell, a little pediment and an iron cross. (dome-detail-275, rebuilt; the work list: "a plain
 * whitewashed box. The espadaña and porch read") The nave in two bays between stepped buttresses down both flanks, its
 * round-headed lights high in stone rings behind their grilles; the door's arch in dressed jambs, imposts and voussoirs;
 * the oculus in its ring of voussoirs, the glass behind an iron cross; the bell gable dressed (its base course, cornice,
 * imposts and balls, the bell on its oak yoke); the porch on two stone columns on their pedestals under a timber beam,
 * whitewashed benches along its sides, its floor a step up from the ground; the canal tiles in relief on both roofs; the
 * stone cross on the back gable, the tiled shrine of the Virgin on the back wall with its lamp; the damp's tide at
 * every wall foot.
 */
const ermita: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const look = ctx.variant;
  // (dome-detail-275) the nave 0.6 m in from the plot's sides: its buttresses reach to the plot's edge
  const fit = wallsIn(ctx, 0.62, 0.08);
  const W = clamp(fit.w, 4.4, 6.6), porch = 1.4;
  const D = clamp(fit.d - porch, 5.6, 9.5);
  const leaf = shade(rgb(0x4a3322), 0.9 + look() * 0.2);
  sink.placed(0, fit.cx, 0, fit.cz, () => {
    const H = 4.4, fl = 0.3;
    // (dome-detail-275) the lights: two in the south flank's bays, one in the north's, round-headed
    const bay = D / 4, nl = look() < 0.5 ? 1 : -1;
    const win = (face: 'left' | 'right', u: number): Opening => ({ face, storey: 0, kind: 'window', u, w: 0.55, h: 0.95, y0: 2.0, arch: {} });
    const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: 0, w: 1.3, y0: 0, h: 2.15, arch: {} },
      win('right', -bay), win('right', bay), win('left', nl * bay)];
    const glazing: WindowStyle = { frame: rgb(0x3a3430), frameWidth: 0.05, frameOut: 0.03, bars: 'none', surround: null, sill: { bucket: 'stone', out: 0.08 }, shutters: null };
    const chapel: HouseDialect = {
      window: (s, face, o, y0) => {
        const y = y0 + o.y0, r = o.w / 2;
        windowUnit(s, face, o.u, y, o.w, o.h, glazing, st.rng, st.litShare);
        archGlazing(s, face, o.u, y + o.h, r, glazing.frame);
        archHead(s, face, o.u, y + o.h, r, 'stone', 0.18, 7);
        for (const e of [-1, 1]) faceBox(s, 'stone', face, o.u + e * (r + 0.09), y + o.h / 2, 0.015, 0.18, o.h, 0.03, { decor: true }, { back: true });
        rejilla(s, face, o.u, y, o.w, o.h);
      },
      door: (s, face, o, y0) => {
        doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf, frame: { bucket: 'stone', width: 0.04, out: 0.01 }, steps: null, leafKind: 'plank' }, y0 + o.y0);
        fanLeaf(s, face, o.u, y0 + o.y0 + o.h, o.w / 2, leaf);
      },
      // the oculus over the door cut through the front gable (it was a dark disc on it)
      gableOpenings: (face) => (face.out[2] > 0.5 ? [{ u0: -0.22, u1: 0.22, y0: H + 0.53, y1: H + 0.97 }] : []),
    };
    const zc = -porch / 2;
    sink.placed(0, 0, 0, zc, () => {
      const frame = buildHouse(sink, {
        w: W, d: D, plinth: { h: fl, out: 0.05, bucket: 'stone' }, storeys: [{ h: H, wall: 'plaster' }],
        roof: canal(24, 0.25, 0.08), gableBucket: 'plaster', openings, chimneys: [], gutters: null, verge: null, spall: null, reveal: 0.35, core: 'rubble',
      }, chapel);
      alero(sink, frame);
      canalTiles(sink, frame, look);
      zocalo(sink, frame, 'plaster2', 0.7);
      const f = frame.faces.front, right = frame.faces.right, left = frame.faces.left, back = frame.faces.back;
      // (dome-detail-275) the door's dressed jambs, imposts, voussoirs and keystone
      const r = 0.65, ys = fl + 2.15, ring = 0.26;
      for (const e of [-1, 1]) {
        faceBox(sink, 'stone', f, e * (r + ring / 2), (fl + ys) / 2, 0.05, ring, ys - fl, 0.1, { decor: true }, { back: true });
        faceBox(sink, 'stone', f, e * (r + ring / 2), ys - 0.07, 0.07, ring + 0.12, 0.14, 0.14, { decor: true });
      }
      voussoirs(sink, f, 0, ys, r, ring, 0.1, 9);
      // (dome-detail-275) the oculus: its ring of voussoirs round the cut, the glass at the reveal's back, an iron cross over it
      const oy = H + 0.75, gr = frame.gableReveal;
      for (let i = 0; i < 10; i++) {
        const a0 = i / 10 * Math.PI * 2, a1 = (i + 1) / 10 * Math.PI * 2, rr = 0.36;
        sink.member('stone', facePoint(f, Math.cos(a0) * rr, oy + Math.sin(a0) * rr, 0), facePoint(f, Math.cos(a1) * rr, oy + Math.sin(a1) * rr, 0), 0.18, 0.08, f.out,
          { decor: true, ends: true, ...(i % 2 ? { shade: 0.92 } : {}) }, 0.01);
      }
      facePanel(sink, 'glass', f, 0, oy, -gr + 0.03, 0.44, 0.44, { decor: true, window: f.out });
      for (const [su, sy] of [[0.03, 0.46], [0.46, 0.03]] as const) faceBox(sink, 'structureMetal', f, 0, oy, -gr + 0.05, su, sy, 0.025, { colour: IRON, decor: true });
      // (dome-detail-275) the stepped buttresses down both flanks: the corners' and one between the bays
      for (const face of [right, left]) for (const k of [-1, 0, 1]) contrafuerte(sink, face, k * (D / 2 - 0.38), 2.75 + look() * 0.3, 0.5, 0.64, look);
      // the damp's tide at the feet: the door's span and the buttresses' feet left clear
      dampFoot(sink, f, -W / 2 + 0.05, -r - ring - 0.05, fl, look, 0);
      dampFoot(sink, f, r + ring + 0.05, W / 2 - 0.05, fl, look, 0);
      dampFoot(sink, back, -W / 2 + 0.05, W / 2 - 0.05, fl, look, 1);
      for (const face of [right, left]) for (const e of [-1, 1]) dampFoot(sink, face, e > 0 ? 0.4 : -D / 2 + 0.75, e > 0 ? D / 2 - 0.75 : -0.4, fl, look, 1);
      // (dome-detail-275) the tiled shrine of the Virgin on the back wall, its lamp and its geraniums
      retablo(sink, back, 0, fl + 1.65, look);
      // (dome-detail-275) the stone cross on the back gable's apex
      const ry = frame.roof.ridgeTopY, bz = -D / 2;
      sink.span('stone', -0.2, ry - 0.3, bz - 0.1, 0.2, ry + 0.18, bz + 0.24, { decor: true });
      sink.span('stone', -0.06, ry + 0.18, bz - 0.02, 0.06, ry + 1.05, bz + 0.1, { decor: true, shadow: true });
      sink.span('stone', -0.28, ry + 0.68, bz - 0.02, 0.28, ry + 0.8, bz + 0.1, { decor: true, shadow: true });
      // the bell gable on the front gable's apex. Round 3 (gauntlet wave 108c: "its bell gable has no bell opening"):
      // its opening stood level with the roof's ridge, so the tiles closed it from every side; the gable now rises
      // clear of the ridge, the bell hanging in the sky
      const ridge = frame.roof.ridgeTopY;
      // (props census #5: the bell gable a crown of the roof in the house's plan: it falls with its roof section)
      roofCrown(sink, frame, { kind: 'bellcote', x0: -1.1, x1: 1.1, z0: D / 2 - 0.32, z1: D / 2, y0: ridge - 0.15, y1: ridge + 3.6, bucket: 'plaster' },
        () => espadana(sink, { origin: [0, 0, D / 2], u: [1, 0, 0], out: [0, 0, 1], width: 2.2 }, ridge - 0.15, 2.2, 0.32, 0.27, true, true));
    });
    // the porch: (dome-detail-275) two stone columns on their pedestals (a whitewashed core carries the collision), the
    // timber beam across them and its ends, the lean-to of tiles from the front wall, the whitewashed benches along its
    // sides, its paved floor a step up from the ground
    const fz = zc + D / 2, pz = fz + porch, cz = pz - 0.24, px = 1.2, ch = 2.45, beamY = 0.18 + 0.5 + ch;
    for (const s of [-1, 1]) {
      sink.span('stone', s * px - 0.26, -0.3, cz - 0.26, s * px + 0.26, 0.68, cz + 0.26);
      sink.span('stone', s * px - 0.3, 0.6, cz - 0.3, s * px + 0.3, 0.68, cz + 0.3, { decor: true });
      sink.span('plaster', s * px - 0.1, 0.68, cz - 0.1, s * px + 0.1, beamY, cz + 0.1);
      columna(sink, [s * px, 0.68, cz], ch, 0.15);
      // the bench (poyo) between the column's pedestal and the wall
      sink.span('plaster', s * px - 0.22 + (s > 0 ? 0.04 : 0), 0.18, fz + 0.02, s * px + 0.22 - (s > 0 ? 0 : 0.04), 0.6, cz - 0.27, { decor: true, shadow: true });
      sink.span('stone', s * px - 0.25, 0.6, fz + 0.02, s * px + 0.25, 0.66, cz - 0.27, { decor: true });
    }
    sink.span('structureWood', -px - 0.4, beamY, cz - 0.13, px + 0.4, beamY + 0.24, cz + 0.13, { colour: rgb(0x4e3a28), decor: true, shadow: true });
    const lean: RoofSpec = { kind: 'shed', pitchDeg: 16, eave: 0.12, verge: 0.18, thickness: 0.1, bucket: 'roof' };
    const pTop = beamY + 0.24;
    // (its eave inside the plot's front: the slab is the porch's collision)
    sink.placed(-Math.PI / 2, 0, 0, fz + (porch - 0.08) / 2, () => {
      const rg = roofGeometry(porch - 0.08, 2.9, pTop, lean);
      emitRoof(sink, rg, lean);
      canalTilesOn(sink, rg, lean, null, look);
    });
    sink.span('stone', -1.55, -0.3, fz, 1.55, 0.18, pz + 0.12, { decor: true });
    sink.span('stone', -1.4, -0.3, pz + 0.12, 1.4, 0.08, pz + 0.4, { decor: true, shade: 0.9 });
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
    // (props census #15, Lane C 2026-10-16: the inscription was a dark plate on the plaque) its sunken field framed by a
    // moulding, the field a shade darker in the shadow of its frame
    const py = frame.floors[1] + 1.7;
    for (const dy of [-0.2, 0.2]) faceBox(sink, 'stone', f, 0, py + dy, 0.075, 2.1, 0.05, 0.03, { decor: true, fine: true });
    for (const du of [-1.03, 1.03]) faceBox(sink, 'stone', f, du, py, 0.075, 0.05, 0.45, 0.03, { decor: true, fine: true });
    faceBox(sink, 'stone', f, 0, py, 0.062, 2.0, 0.36, 0.004, { decor: true, shade: 0.78 });
    // (dome-detail-275, the roof sweep) the canal tiles in relief down the four slopes, the cap tiles down the hips
    canalTiles(sink, frame, look, { hipEnds: false });
    hipCaps(sink, frame);
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
  // (dome-detail-275, the roof sweep) the house's and the wing's frames, their tiles laid last (the look stream as it was)
  const frames: HouseFrame[] = [];
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
    frames.push(frame);
  });
  // the stable wing along the far side, under a lean-to falling outward: its walls a prism under the slope
  const sw = clamp((x1 - x0) * 0.24, 2.8, 3.6), sx0 = x1 - sw;
  const pitch = 13, low = 2.3;
  // (the looks lane, 2026-10-15; WORKLIST #15: "andalusian cuadras wing ... on buildHouse"; the r2 probe read its three
  // stable doors as plank plates laid on a solid prism) the wing on the house grammar: its whitewashed rubble walls on a
  // low plinth, the three stable doors cut through the patio wall in their deep reveals, each a pair of ledged plank leaves
  // under a timber lintel, a hatch for the hay over the middle one, the walls' ends closed up under the lean-to of tiles
  const lean: RoofSpec = { kind: 'shed', pitchDeg: pitch, eave: 0.25, verge: 0.12, thickness: 0.12, bucket: 'roof' };
  const wingDoors = [-D * 0.28, D * 0.08, D * 0.36];
  const stable: Opening[] = wingDoors.map((u): Opening => ({ face: 'left', storey: 0, kind: 'door', u, w: 1.2, y0: 0, h: 1.9 }));
  stable.push({ face: 'left', storey: 0, kind: 'loft', u: (wingDoors[0] + wingDoors[1]) / 2, w: 0.6, y0: 1.55, h: 0.45 });
  const wingDialect: HouseDialect = {
    window: (s, face, o, y0) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: shade(st.door, 0.78), frame: { bucket: 'structureWood', width: 0.08, out: 0.03, colour: shade(st.door, 0.6) }, steps: null, leafKind: 'plank' }),
    door: (s, face, o, y0) => {
      doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: shade(st.door, 0.85), frame: { bucket: 'plaster2', width: 0.14, out: 0.015 }, steps: null, leafKind: 'plank' });
      // the timber lintel over the door, its ends bedded in the wall a hand each side
      faceBox(s, 'structureWood', face, o.u, y0 + o.y0 + o.h + 0.09, 0.025, o.w + 0.5, 0.16, 0.05, { colour: shade(st.door, 0.55), decor: true });
    },
  };
  sink.placed(0, (sx0 + x1) / 2, 0, 0, () => {
    const wf = buildHouse(sink, {
      w: sw, d: D, plinth: { h: 0.2, out: 0.03, bucket: 'stone' }, storeys: [{ h: low - 0.2, wall: 'plaster' }], roof: lean, gableBucket: 'plaster',
      openings: stable, chimneys: [], gutters: null, verge: null, spall: null, reveal: 0.24,
    }, wingDialect);
    frames.push(wf);
    // the walls' ends up under the lean-to's rise
    const tanP = Math.tan(pitch * Math.PI / 180);
    for (const zs of [1, -1] as const) {
      const end: Face = { origin: [0, 0, zs * D / 2], u: [zs, 0, 0], out: [0, 0, zs], width: sw };
      const hi = -zs * sw / 2;
      wallPolygon(sink, 'plaster', end, [[-sw / 2, wf.eaveY], [sw / 2, wf.eaveY], [hi, wf.eaveY + sw * tanP]], 0.2);
    }
  });

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
  espadana(sink, gf, 3.75, 1.5, 0.4, 0.17, false);
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
  // (dome-detail-275, the roof sweep) the canal tiles in relief on the house and down the wing's lean-to
  sink.placed(0, hx, 0, 0, () => canalTiles(sink, frames[0], look));
  sink.placed(0, (sx0 + x1) / 2, 0, 0, () => canalTiles(sink, frames[1], look));
  });
  return sink.finish();
};

/**
 * The barn (pajar): a long whitewashed rubble barn on a stone plinth under a low roof of canal tiles, the round-arched
 * cart door in the front gable with its stone voussoirs, the hay loft's door above it under a hoist beam, small vents
 * high in the sides. (dome-detail-275, rebuilt; the work list: "a blank whitewashed wall with slit windows under a smooth
 * roof") Its cart arch cut through the gable wall in dressed jambs, imposts and voussoirs round the planked leaves, the
 * guard stones at its feet and the cobbled ramp up to its sill; the hay door cut through the gable over it, its leaves
 * in the reveal on a stone sill under the hoist beam, its pulley and rope; the long flanks in three bays between stepped
 * buttresses, each bay's vent in a stone sill and lintel with its bar; the owl holes in the back gable; the canal tiles
 * in relief; the damp's tide at every wall foot; a stone trough against one flank, the straw stacked at the back, a
 * prickly pear at a corner.
 */
/** (dome-detail-275) A barn's sun-faded boards: grey-brown, a faded green, an old oxblood. */
const BARN_WOOD: readonly Rgb[] = [0x7a6852, 0x6a5a48, 0x857560, 0x5c6a56, 0x7a4a3a].map(rgb);

const pajar: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const look = ctx.variant;
  // (dome-detail-275) the walls half a metre in from the plot's long sides: the buttresses fill the plot to its edge
  const fit = wallsIn(ctx, 0.55, 0.1);
  // (and 0.3 m short of its depth, standing to its front: the back's strip takes the straw and the door's path)
  const W = clamp(fit.w, 6.0, 9.5), D = clamp(fit.d - 0.3, 9, 14.5), zc = fit.cz + Math.max(0, fit.d - D) / 2;
  const fl = 0.4, H = 4.3, eave = fl + H;
  const leaf = shade(pick(look, BARN_WOOD), 0.88 + look() * 0.18);
  const gw = 2.8, spring = 2.15, vw = 0.24, vh = 0.72, vy = 2.65;
  sink.placed(0, fit.cx, 0, zc, () => {
    // (dome-detail-275) the flanks in three bays between the buttresses, a vent in each bay
    const bay = D / 3;
    const openings: Opening[] = [
      { face: 'front', storey: 0, kind: 'gate', u: 0, w: gw, y0: 0, h: spring, arch: {} },
      { face: 'back', storey: 0, kind: 'door', u: W * 0.2, w: 1.1, y0: 0, h: 2.1 },
    ];
    for (const face of ['right', 'left'] as const) for (const k of [-1, 0, 1]) openings.push({ face, storey: 0, kind: 'loft', u: k * bay + (look() - 0.5) * 0.3, w: vw, y0: vy, h: vh });
    const barn: HouseDialect = {
      // (dome-detail-275) a vent: left open to the mow's dark, in a stone sill and lintel, an iron bar up its middle
      window: (s, face, o, y0) => {
        const y = y0 + o.y0;
        faceBox(s, 'stone', face, o.u, y + o.h + 0.08, 0.03, o.w + 0.34, 0.16, 0.06, { decor: true, shadow: true });
        faceBox(s, 'stone', face, o.u, y - 0.05, 0.04, o.w + 0.22, 0.1, 0.08, { decor: true });
        faceBox(s, 'structureMetal', face, o.u, y + o.h / 2, -s.recess / 2, 0.025, o.h + 0.03, 0.025, { colour: IRON, decor: true });
      },
      door: (s, face, o, y0) => {
        if (o.kind === 'gate') {
          // the planked leaves in the reveal under the arch's planked head
          gateUnit(s, face, o.u, y0 + o.y0, o.w, o.h, leaf, { bucket: 'structureWood', width: 0.1, out: 0.03, colour: shade(leaf, 0.62) });
          fanLeaf(s, face, o.u, y0 + o.y0 + o.h + 0.1, o.w / 2, shade(leaf, 0.92));
          return;
        }
        doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf, frame: { bucket: 'stone', width: 0.16, out: 0.03 }, steps: { bucket: 'stone', rise: 0.2, tread: 0.26 }, leafKind: 'plank' }, y0 + o.y0);
        // the timber lintel over it, its ends bedded in the wall a hand each side
        faceBox(s, 'structureWood', face, o.u, y0 + o.y0 + o.h + 0.12, 0.03, o.w + 0.5, 0.18, 0.06, { colour: shade(leaf, 0.6), decor: true });
      },
      // (dome-detail-275) the hay door through the front gable over the arch, three owl holes through the back one
      gableOpenings: (face) => (face.out[2] > 0.5 ? [{ u0: -0.42, u1: 0.42, y0: eave + 0.12, y1: eave + 0.92 }]
        : [{ u0: -0.08, u1: 0.08, y0: eave + 0.95, y1: eave + 1.13 }, ...[-1, 1].map((e) => ({ u0: e * 0.38 - 0.08, u1: e * 0.38 + 0.08, y0: eave + 0.5, y1: eave + 0.68 }))]),
    };
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: fl, out: 0.05, bucket: 'stone' }, storeys: [{ h: H, wall: 'plaster' }],
      roof: canal(22, 0.3), gableBucket: 'plaster', openings, chimneys: [], gutters: null, verge: null, spall: null, reveal: 0.4, core: 'rubble',
    }, barn);
    alero(sink, frame);
    canalTiles(sink, frame, look);
    const f = frame.faces.front, bk = frame.faces.back, right = frame.faces.right, left = frame.faces.left;
    // (dome-detail-275) the cart arch: dressed jambs and imposts, the voussoirs and the keystone; the guard stones
    // (guardacantones) at its feet against the wheels; the cobbled ramp up to its sill, worn in two ruts
    const r = gw / 2, ys = fl + spring, ring = 0.3;
    for (const e of [-1, 1]) {
      faceBox(sink, 'stone', f, e * (r + ring / 2), (fl + ys) / 2, 0.06, ring, spring, 0.12, { decor: true }, { back: true });
      faceBox(sink, 'stone', f, e * (r + ring / 2), ys - 0.08, 0.08, ring + 0.14, 0.16, 0.16, { decor: true, shadow: true });
      sink.revolve('stone', facePoint(f, e * (r + 0.16), 0, 0.2), 'y', [[0, 0.2], [0.35, 0.17], [0.62, 0.1], [0.7, 0]], 8, { decor: true, shadow: true });
    }
    voussoirs(sink, f, 0, ys, r, ring, 0.12, 11);
    const ramp: Vec3[] = [facePoint(f, -r - 0.1, -0.05, 0.62), facePoint(f, r + 0.1, -0.05, 0.62), facePoint(f, r + 0.1, fl, 0.0), facePoint(f, -r - 0.1, fl, 0.0)];
    prismAuto(sink, 'stone', ramp, [0, 1, 0], 0.02, { decor: true, shade: 0.9 });
    for (const e of [-0.55, 0.55]) facing(sink, 'stone', [facePoint(f, e - 0.16, 0.0, 0.62), facePoint(f, e + 0.16, 0.0, 0.62), facePoint(f, e + 0.16, fl + 0.02, 0.01),
      facePoint(f, e - 0.16, fl + 0.02, 0.01)], [f.out[0] * 0.5, 1, f.out[2] * 0.5], { decor: true, shade: 0.72 });
    // (dome-detail-275) the hay door's leaves in the gable's reveal, its stone sill and lintel; the hoist beam out over
    // it, the pulley block at its end, the rope down to a cleat in the wall beside the arch
    const gr = frame.gableReveal;
    sink.recess = gr;
    try {
      doorUnit(sink, f, 0, eave + 0.12, 0.84, 0.8, { leaf: shade(leaf, 1.08), frame: { bucket: 'structureWood', width: 0.06, out: 0.02, colour: shade(leaf, 0.6) }, steps: null, leafKind: 'plank' }, eave + 0.12);
    } finally { sink.recess = 0; }
    faceBox(sink, 'stone', f, 0, eave + 0.07, 0.05, 1.1, 0.1, 0.1, { decor: true });
    faceBox(sink, 'stone', f, 0, eave + 1.0, 0.03, 1.16, 0.16, 0.06, { decor: true, shadow: true });
    const beamY = eave + 1.27, beamOut = 0.62;
    faceBox(sink, 'structureWood', f, 0, beamY, beamOut / 2 - 0.1, 0.16, 0.18, beamOut + 0.2, { colour: rgb(0x5a4632), decor: true, shadow: true, uv: UV_MEMBER });
    faceBox(sink, 'structureWood', f, 0, beamY - 0.2, beamOut - 0.12, 0.1, 0.22, 0.16, { colour: rgb(0x3e3226), decor: true });
    sink.member('structureWood', facePoint(f, 0.04, beamY - 0.31, beamOut - 0.12), facePoint(f, 0.78, eave + 0.3, 0.06), 0.025, 0.025, normalize3([f.u[0], 0, f.u[2]]),
      { colour: rgb(0x8a7a5a), decor: true, exposed: true }, 0);
    faceBox(sink, 'structureMetal', f, 0.78, eave + 0.28, 0.04, 0.16, 0.05, 0.08, { colour: IRON, decor: true });
    // (dome-detail-275) the stepped buttresses at the bays' ends down both flanks, the corners' and between the bays'
    for (const face of [right, left]) {
      for (const k of [-1.5, -0.5, 0.5, 1.5]) {
        const u = clamp(k * bay, -D / 2 + 0.42, D / 2 - 0.42);
        contrafuerte(sink, face, u, 3.0 + look() * 0.35, 0.42, 0.74, look);
      }
    }
    // the damp's tide and the render's losses at every wall foot (the arch's and the door's spans left clear)
    dampFoot(sink, f, -W / 2 + 0.05, -r - ring - 0.05, fl, look, 0);
    dampFoot(sink, f, r + ring + 0.05, W / 2 - 0.05, fl, look, 0);
    const du = W * 0.2;
    dampFoot(sink, bk, -W / 2 + 0.05, du - 0.8, fl, look, 1);
    dampFoot(sink, bk, du + 0.8, W / 2 - 0.05, fl, look, 0);
    for (const face of [right, left]) for (const k of [-1, 0, 1]) dampFoot(sink, face, k * bay - bay / 2 + 0.45, k * bay + bay / 2 - 0.45, fl, look, 1);
    // (dome-detail-275) a stone trough against one flank in its middle bay, the water dark in it
    const tf = look() < 0.5 ? right : left, tu = bay * (0.15 + look() * 0.2) * (look() < 0.5 ? -1 : 1);
    faceBox(sink, 'stone', tf, tu, 0.25, 0.27, 1.7, 0.6, 0.54, { decor: true, shadow: true }, { back: true });
    facing(sink, 'dark', [facePoint(tf, tu - 0.74, 0.5, 0.08), facePoint(tf, tu + 0.74, 0.5, 0.08), facePoint(tf, tu + 0.74, 0.5, 0.46), facePoint(tf, tu - 0.74, 0.5, 0.46)],
      [0, 1, 0], { decor: true });
    for (const e of [-1, 1]) faceBox(sink, 'stone', tf, tu + e * 0.79, 0.58, 0.27, 0.12, 0.06, 0.54, { decor: true });
    for (const o of [0.04, 0.5]) faceBox(sink, 'stone', tf, tu, 0.58, o, 1.46, 0.06, 0.08, { decor: true });
    sink.dressing(st.mobile, () => {
      // (dome-detail-275) the straw stacked against the back wall away from its door: bales on bales, one fallen
      const straw = rgb(0xcdb47c), bx = look() < 0.5 ? -1 : 1, bu0 = -bx * W * 0.08, bo = 0.25;
      if (bx * (bu0 - du) < 0) {
        for (let k = 0; k < 3; k++) {
          const u = bu0 - bx * (0.55 + k * 0.95), y = 0.18;
          faceBox(sink, 'structureWood', bk, u, y, bo, 0.9, 0.36, 0.46, { colour: shade(straw, 0.86 + look() * 0.2), decor: true, shadow: true }, { back: true });
          if (k < 2) faceBox(sink, 'structureWood', bk, u - bx * 0.45, y + 0.36, bo, 0.9, 0.36, 0.46, { colour: shade(straw, 0.9 + look() * 0.2), decor: true, shadow: true }, { back: true });
        }
      }
      // a prickly pear at a back corner
      if (look() < 0.7) chumbera(sink, (look() < 0.5 ? -1 : 1) * (W / 2 + 0.25), -D / 2 + 1.2, 0.95 + look() * 0.25, look);
    });
  });
  return sink.finish();
};

/**
 * The dovecote (palomar): a square whitewashed tower under a low hipped cap of tiles, its pigeon holes in rows under the
 * eaves above a projecting ledge, a low store against its front with its own door. (Props census #22, Lane C
 * 2026-10-16: "destroyed by destructionDefaultKit ... not its own pieces"; the holes were 1 cm dark plates.) Both bodies
 * are houses now (house.ts buildHouse): the tower's pigeon holes are cut through its rubble wall in their reveals, each
 * row on its landing ledge, and the store's door is cut through its front; the damage reads the tower and the store as
 * two bodies. (dome-detail-275; the work list: a plain tower under a smooth cap) The cap's canal tiles in relief and its
 * hips' cap tiles, a moulded cornice under its eave, the corner pedestals rising out of the tiles with their glazed balls,
 * the weathervane on the apex; the band of glazed tiles round the tower the rats cannot climb; a few pigeons on the
 * ledges; the store's tiles, its door's lintel, the drinking trough by its side; the damp's tide at every wall foot.
 */
const palomar: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const look = ctx.variant;
  // the dovecote at the back of the base granary's measured box, its store reaching the box's front
  const bb = ctx.bounds;
  const S = clamp(Math.min(bb.maxX - bb.minX - 0.5, 3.8), 3.0, 3.8), half = S / 2;
  const tz = bb.minZ + 0.25 + half, H = 5.8, xc = (bb.minX + bb.maxX) / 2, plinth = 0.4;
  const cap: RoofSpec = { kind: 'hip', pitchDeg: 24, eave: 0.25, verge: 0.25, thickness: 0.12, bucket: 'roof', ridge: 'round' };
  // the pigeon holes: three rows under the eaves on the three free faces, every other hole along a row
  const rows = [4.55, 4.87, 5.19], holes: Opening[] = [];
  for (const face of ['front', 'right', 'left'] as const) {
    for (let r = 0; r < rows.length; r++) for (let k = 0; k < 5; k++) {
      if ((r + k) % 2) continue;
      holes.push({ face, storey: 0, kind: 'loft', u: -S / 2 + 0.4 + k * (S - 0.8) / 4, w: 0.13, h: 0.15, y0: rows[r] - plinth });
    }
  }
  // a small light at the back for the loft
  holes.push({ face: 'back', storey: 0, kind: 'window', u: 0, w: 0.45, h: 0.55, y0: 3.4 - plinth });
  const lintel = shade(st.door, 0.55);
  const quiet: HouseDialect = {
    // a pigeon hole is left empty: its reveal and the dark of the loft behind it
    window: (s, face, o, y0) => { if (o.kind !== 'loft') windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { ...st.window, shutters: null, bars: 'none' }, st.rng, 0); },
    door: (s, face, o, y0, frame) => {
      doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, {
        leaf: st.door, frame: { bucket: st.band ?? 'plaster2', width: 0.12, out: 0.015 }, steps: null, leafKind: 'plank',
      }, frame.floors[o.storey] + o.y0);
      // (dome-detail-275) the timber lintel over the store's door, bedded a hand each side
      faceBox(s, 'structureWood', face, o.u, y0 + o.y0 + o.h + 0.2, 0.03, o.w + 0.5, 0.15, 0.06, { colour: lintel, decor: true });
    },
  };
  sink.placed(0, xc, 0, 0, () => {
    sink.placed(0, 0, 0, tz, () => {
      const frame = buildHouse(sink, {
        w: S, d: S, plinth: { h: plinth, out: 0.05, bucket: 'stone' }, storeys: [{ h: H - plinth, wall: 'plaster' }], roof: cap,
        openings: holes, chimneys: [], gutters: null, verge: null, reveal: 0.3, core: 'rubble',
      }, quiet);
      // the landing ledges: the broad one under the holes, a narrow one under each row
      for (const name of ['front', 'right', 'left'] as const) {
        const fc = frame.faces[name];
        faceBox(sink, 'plaster', fc, 0, 4.25, 0.1, S + 0.1, 0.12, 0.2, { decor: true, shadow: true });
        for (const y of rows.slice(1)) faceBox(sink, 'plaster', fc, 0, y - 0.035, 0.05, S - 0.3, 0.05, 0.1, { decor: true });
      }
      // (dome-detail-275) the cap's tiles in relief and its hips' cap tiles; a moulded cornice under its eave
      canalTiles(sink, frame, look);
      hipCaps(sink, frame);
      sink.band('plaster', -half - 0.1, H - 0.2, -half - 0.1, half + 0.1, H - 0.02, half + 0.1, { decor: true, shadow: true });
      sink.band('plaster2', -half - 0.05, H - 0.34, -half - 0.05, half + 0.05, H - 0.2, half + 0.05, { decor: true });
      // (dome-detail-275) the rats' band: a course of glazed tiles round the tower over the store's roof, white between
      // two lines of green, a hand proud
      const ry = 3.15;
      sink.band('structureMetal', -half - 0.025, ry - 0.14, -half - 0.025, half + 0.025, ry + 0.14, half + 0.025, { colour: AZ_WHITE, decor: true });
      for (const e of [-1, 1]) sink.band('structureMetal', -half - 0.035, ry + e * 0.16 - 0.035, -half - 0.035, half + 0.035, ry + e * 0.16 + 0.035, half + 0.035, { colour: AZ_GREEN, decor: true });
      // (dome-detail-275) the corner pedestals rising out of the tiles at the eave's corners, each with its glazed ball
      const ball = look() < 0.5 ? AZ_GREEN : AZ_BLUE;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
        const px = sx * (half - 0.12), pz = sz * (half - 0.12);
        sink.span('plaster', px - 0.18, H - 0.2, pz - 0.18, px + 0.18, H + 0.5, pz + 0.18, { decor: true, shadow: true });
        sink.span('plaster2', px - 0.22, H + 0.5, pz - 0.22, px + 0.22, H + 0.6, pz + 0.22, { decor: true });
        pinaculo(sink, [px, H + 0.6, pz], 0.8, ball);
      }
      // (dome-detail-275) the weathervane on the apex: its glazed ball, the iron rod, the arrow and its tail
      const apex = frame.roof.ridgeTopY;
      sink.revolve('structureMetal', [0, apex - 0.08, 0], 'y', [[0, 0.12], [0.12, 0.16], [0.26, 0.1], [0.32, 0]], 8, { colour: ball, decor: true, shadow: true });
      sink.span('structureMetal', -0.02, apex + 0.2, -0.02, 0.02, apex + 1.35, 0.02, { colour: IRON, decor: true });
      const va = look() * Math.PI, ax = Math.cos(va), az = Math.sin(va);
      sink.member('structureMetal', [-ax * 0.45, apex + 1.1, -az * 0.45], [ax * 0.45, apex + 1.1, az * 0.45], 0.03, 0.03, [0, 1, 0], { colour: IRON, decor: true, exposed: true }, 0.015);
      sink.member('structureMetal', [-ax * 0.45, apex + 1.0, -az * 0.45], [-ax * 0.45, apex + 1.22, -az * 0.45], 0.2, 0.012, [-az, 0, ax], { colour: IRON, decor: true, exposed: true }, 0.006);
      for (const e of [-1, 1]) sink.member('structureMetal', [ax * 0.45, apex + 1.1, az * 0.45], [ax * 0.3 - az * e * 0.08, apex + 1.1, az * 0.3 + ax * e * 0.08], 0.025, 0.025, [0, 1, 0],
        { colour: IRON, decor: true, exposed: true }, 0.012);
      // the damp's tide at the tower's free feet
      for (const name of ['right', 'left', 'back'] as const) dampFoot(sink, frame.faces[name], -half + 0.05, half - 0.05, plinth, look, 1);
      // (dome-detail-275) a few pigeons on the broad ledge, grey and white, here and there one on a row's ledge
      const birds = [rgb(0x8c8e94), rgb(0x6f7178), rgb(0xd8d6d0), rgb(0x9a8e86)];
      for (const name of ['front', 'right', 'left'] as const) {
        const fc = frame.faces[name];
        for (let k = 0; k < 3; k++) {
          if (look() < 0.45) continue;
          const u = (look() - 0.5) * (S - 0.6), c = pick(look, birds), y = 4.31;
          faceBox(sink, 'structureWood', fc, u, y + 0.06, 0.12, 0.2, 0.12, 0.1, { colour: c, decor: true, fine: true });
          faceBox(sink, 'structureWood', fc, u + 0.1, y + 0.15, 0.13, 0.06, 0.06, 0.06, { colour: c, decor: true, fine: true });
        }
      }
    });
    // the store in front, its lean-to falling toward the plot's front, its door cut through its front
    const s0 = tz + half, s1 = bb.maxZ - 0.22;
    if (s1 - s0 > 1.2) {
      const L = s1 - s0, lean: RoofSpec = { kind: 'shed', pitchDeg: 14, eave: 0.2, verge: 0.1, thickness: 0.1, bucket: 'roof' };
      // built a quarter turned: the house's +x (its low eave, its door) toward the plot's front
      sink.placed(-Math.PI / 2, 0, 0, (s0 + s1) / 2, () => {
        const sf = buildHouse(sink, {
          w: L, d: S - 0.2, plinth: null, storeys: [{ h: 2.3, wall: 'plaster' }], roof: lean,
          openings: [{ face: 'right', storey: 0, kind: 'door', u: 0, w: 0.95, y0: 0, h: 1.85 }],
          chimneys: [], gutters: null, verge: null, reveal: 0.25, core: 'rubble',
        }, quiet);
        // (dome-detail-275) its tiles in relief, the damp at its feet
        canalTiles(sink, sf, look);
        dampFoot(sink, sf.faces.right, -(S - 0.2) / 2 + 0.05, -0.7, 0, look, 0);
        dampFoot(sink, sf.faces.right, 0.7, (S - 0.2) / 2 - 0.05, 0, look, 0);
        // (dome-detail-275) the pigeons' drinking trough against its side: a stone basin, the water dark in it
        const side = look() < 0.5 ? sf.faces.front : sf.faces.back;
        faceBox(sink, 'stone', side, 0, 0.17, 0.17, 0.9, 0.34, 0.34, { decor: true, shadow: true }, { back: true });
        facing(sink, 'dark', [facePoint(side, -0.38, 0.32, 0.05), facePoint(side, 0.38, 0.32, 0.05), facePoint(side, 0.38, 0.32, 0.29), facePoint(side, -0.38, 0.32, 0.29)],
          [0, 1, 0], { decor: true });
        for (const e of [-1, 1]) faceBox(sink, 'stone', side, e * 0.41, 0.36, 0.17, 0.08, 0.04, 0.34, { decor: true });
        for (const o of [0.03, 0.31]) faceBox(sink, 'stone', side, 0, 0.36, o, 0.74, 0.04, 0.06, { decor: true });
      });
    }
    if (look() < 0.5) sink.dressing(st.mobile, () => chumbera(sink, half + 0.45, tz, 0.9, look));
  });
  return sink.finish();
};

/**
 * The bread oven (horno) of a cortijo's yard (the props census #17, 2026-10-15, the judges: "cut the oven mouth as an
 * arch with brick or stone voussoirs and a dark chamber at least 0.4 m deep, with a hearth sill and a soot stain; lay the
 * dome in lime-washed rubble or brick courses (stepped rings) with a capped flue; build the rack from round or hewn posts
 * on stone bases with a beam and rafters under canal tile rows"): the oven's block on its stone footing at the plot's
 * -x end, its mouth cut half a metre into it under a ring of brick voussoirs, the hearth's sill and the soot over the
 * mouth; the dome laid ring by ring in limewashed brick (outbuildings.ts coursedRound) to its flue under a tile cap; the
 * firewood rack on the plot's +x side, built member by member (openShed: posts on stone bases, the beam, the rafters,
 * the canal tiles in rows), boarded against the oven, the wood stacked along it. It falls as its posts and
 * tiles and the oven's own heap.
 */
const horno: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const look = ctx.variant, mobile = ctx.tier === 'mobile';
  const b = ctx.bounds, W = b.maxX - b.minX, D = b.maxZ - b.minZ, cz = (b.minZ + b.maxZ) / 2;
  const B = clamp(Math.min(D - 0.1, W - 0.65), 1.8, 2.6), h = B / 2;
  const ox = b.minX + 0.05 + h;
  sink.span('stone', ox - h - 0.04, -0.4, cz - h - 0.04, ox + h + 0.04, 0.3, cz + h + 0.04);
  // the block, cut for the mouth: a chamber 0.48 m deep, the walls round it, its floor the hearth's
  const mw = 0.55, my0 = 0.51, my1 = 0.93, md = 0.48, fz = cz + h;
  sink.span('plaster', ox - h, 0.3, cz - h, ox + h, my0, cz + h);
  sink.span('plaster', ox - h, my1, cz - h, ox + h, 1.05, cz + h);
  sink.span('plaster', ox - h, my0, cz - h, ox - mw / 2, my1, cz + h);
  sink.span('plaster', ox + mw / 2, my0, cz - h, ox + h, my1, cz + h);
  sink.span('plaster', ox - mw / 2, my0, cz - h, ox + mw / 2, my1, fz - md);
  const f: Face = { origin: [ox, 0, fz], u: [1, 0, 0], out: [0, 0, 1], width: B };
  // the chamber's back in the dark, and its fire-blackened sides (the soot inside the mouth)
  sink.quad('dark', facePoint(f, -mw / 2, my0, -md + 0.005), facePoint(f, mw / 2, my0, -md + 0.005), facePoint(f, mw / 2, my1, -md + 0.005), facePoint(f, -mw / 2, my1, -md + 0.005), {});
  // the hearth's sill out of the mouth, the ring of brick voussoirs round its segmental head, the soot over it
  faceBox(sink, 'stone', f, 0, my0 - 0.04, 0.12, mw + 0.3, 0.08, 0.24, { decor: true });
  for (let k = 0; k <= 6; k++) {
    const a = Math.PI * (0.12 + 0.76 * k / 6), r = mw / 2 + 0.07;
    const u = -Math.cos(a) * r, y = my1 - 0.08 + Math.sin(a) * r * 0.55;
    faceBox(sink, 'stone', f, u, y, 0.02, 0.1, 0.16, 0.06, { decor: true, tint: [1.25, 0.82, 0.62], shade: 0.85 + look() * 0.2 });
  }
  sink.quad('plaster', facePoint(f, -mw / 2 - 0.05, my1 + 0.02, 0.004), facePoint(f, mw / 2 + 0.05, my1 + 0.02, 0.004), facePoint(f, mw / 2 + 0.12, 1.04, 0.004),
    facePoint(f, -mw / 2 - 0.12, 1.04, 0.004), { decor: true, shadeAt: (p: Vec3) => 0.3 + 0.6 * Math.max(0, Math.min(1, (p[1] - my1) / 0.14)) });
  // the dome in limewashed brick, ring by ring on its drum, and the flue under its tile cap
  const round = coursedRound(sink, { cx: ox, cz, R: h * 0.97, wallH: 0.2, T: 0.3, course: 0.2, stone: 0.42, base: 1.05,
    cone: { rings: 5, rise: 0.95, cap: 0.18, dome: true }, bucket: 'plaster', door: null, mobile }, look);
  sink.span('plaster', ox - 0.16, round.top - 0.25, cz - 0.16, ox + 0.16, round.top + 0.32, cz + 0.16);
  sink.span('roof', ox - 0.22, round.top + 0.32, cz - 0.22, ox + 0.22, round.top + 0.4, cz + 0.22, { decor: true });
  // the firewood rack: from the oven's side to the plot's +x edge, as long as the plot is deep less a hand (the solid
  // within half a metre of the base's reach), its back posts close against the oven's side and boarded there, the wood
  // stacked along the oven (the integrity check: a head plate resting on the block left the rack under a metre high,
  // its front closed to the eye; a slot between the dome and the lean-to's head showed the stack as a pocket)
  const x0 = ox + h + 0.04, x1 = b.maxX - 0.02, sw = x1 - x0, rz = Math.max(h - 0.06, D / 2 - 0.3);
  if (sw > 0.35) {
    const RW = sw, pitch = 14, rc = x1 - RW / 2;
    sink.placed(0, rc, 0, cz, () => {
      openShed(sink, { W: RW, D: 2 * rz, hLo: 1.2, pitchDeg: pitch, back: true, ends: false, pile: 0.9 + look() * 0.2, pileHalf: h - 0.16, braces: false, mobile,
        masses: [{ x: ox - rc, z: 0, r: h, h: round.top, bucket: 'plaster' }] }, {
        timber: rgb(0x6a5440), post: 0.13, round: true, pad: { bucket: 'stone', size: 0.28, top: 0.14 },
        cladding: 'gapped', boards: [rgb(0x7a6450)], boardW: 0.2,
        covering: 'canal', roofBucket: 'roof', eave: 0.15, verge: 0.12,
      }, look);
    });
  } else recordMasonry(sink, { x: ox, z: cz, r: h, h: round.top, bucket: 'plaster' }, null);
  return sink.finish();
};

const ANDALUSIAN_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
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
    // the gorge's golden calcarenite (the Puente Nuevo's stone), dressed: (the owner, 2026-10-21, on the gorge bridge: "a
    // mass of repeated textures") the rough sandstone's tan, cream and grey-green blocks (spread 0.2, hue 0.1) laid a
    // patchwork across the bridge's hundred metres; the dressed ashlar's even courses halve the swing
    stone: { kind: 'sandstone', tint: [0.82, 0.73, 0.57], dressed: true },
    sourced: { plaster: false, wood: true },
    // (the facades lane, round 11; waves 319/320: the walls' procedural canvas read as "speckle", "sponge", "cork",
    // "camouflage noise": its 6 cm bumps shade as dots from the street, as Steinburg's did before round 8) the walls
    // painted as the region renders them (regionalSurfaces.ts paintLimewash), every family under the kit's and the map's
    // tones
    render: { kind: 'limewash', seed: 0x6c2a },
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
    mossTint: [0.97, 0.93, 0.74],
  },
  // the yards: stone garden walls round a kitchen garden and the bread oven, a gate (yards.ts)
  yard: { kinds: ['cottage', 'farmhouse'], fence: 'wallstone', gate: 'gatestone', shed: 'woodshed', shedSize: [3.2, 2.8], garden: true },
});
