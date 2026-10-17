// src/world/maps/regional/hostomelDacha.ts — the dachas of Kestrel Airfield's garden cooperatives (the Hostomel kit,
// maps/regional/hostomel.ts; the maps lane's Kestrel rebuild, 2026-10-15, from the map-revival lane's round 1,
// 469c810d9). Round the Antonov airport the sadovi tovarystva of Hostomel and Bucha were laid out from the 1960s on
// six-sotok plots: a cottage of one storey in planks or rendered block on a brick plinth under a steep gable of
// asbestos-cement or painted sheet, the attic room behind a gable window to the lane, a small brick stack, the glazed
// veranda down one side (or across the back on a deep lot) under its lean-to, the garden shed at the plot's back.
//
// (the looks lane, 227: the census's lift toward Verdant's element set, BLD-04) The house as Kyiv oblast finishes it,
// through the house grammar and the shared opening, facade and dressing helpers, its body, plot and collision as they
// were: every window in its painted board surround (lyshtva) with a sill, the older houses' plank shutters (vikonnytsi);
// on a desktop build the carved nalychnyky over the windows (a sawn crest board where the eave leaves room, a sawn
// pediment where it does not), the shutters painted with a border and a diamond or a heart, the tsokol painted dark
// round the plinth, the carved verge boards and their towel board on a boarded gable, a dormer to the attic room on an
// asbestos-cement roof, the sheet canopy (kozyrok) over the door on its brackets, mal'vy against the lane gable, a bench
// under the front window, the winter's firewood stacked under the eave; galvanised or painted gutters and downpipes on a
// house whose eaves are clear of its veranda; the veranda's lights each in a casing; firewood against the garden shed.
import { PartSink, faceBox, facePoint, pick, rgb, shade, streamFrom, type Face, type RegionalBucket, type Rgb } from './geometry.ts';
import { buildHouse, wallPolygon, windowRhythm, type HoleRect, type HouseFrame, type Opening, type RoofSpec } from './house.ts';
import { doorUnit, windowUnit, type WindowStyle } from './openings.ts';
import { bench, hollyhocks, tvAerial, woodpile } from './dressing.ts';
import { doorCanopy, facadeOn, facadeRng, plinthPaint, roofDormers, type CrestStyle } from './facade.ts';
import { GALVANISED } from './vernacular.ts';
import type { RegionalBuildContext, RegionalBuilder, YardStyle } from './types.ts';

/** The garden cooperatives' paints (board green, blue, ochre, cream, red-brown, sky blue) and the trim's white. */
const DACHA_PAINT: readonly Rgb[] = [0x4f7d4a, 0x3f6f9a, 0xc9a24a, 0xd9cfae, 0x7a3e30, 0x5a8aa0].map(rgb);
/** Their roofs: asbestos-cement sheet greys, sheet painted green, red or brown. */
const DACHA_SHEET: readonly Rgb[] = [0x9aa0a0, 0x878c8a, 0x4f7a52, 0x8a3a30, 0x6a4a3a].map(rgb);
const DACHA_TRIM = rgb(0xe3ded2), DACHA_PLANK = rgb(0x7a6048);
/**
 * The tsokol's coats (grey-brown, oxblood, blue-grey, olive), as multipliers over the render's own albedo (~0.54
 * linear: kolkhoz.ts PRYZBA), so the band reads as dark as the paint is.
 */
const TSOKOL: readonly Rgb[] = [0x5a544c, 0x6a3a2e, 0x4a5662, 0x55603f].map((hex) => shade(rgb(hex), 1 / 0.54));
/** Mal'vy: crimson, white, wine, pink, plum. */
const MALVY: readonly Rgb[] = [0xc23a5e, 0xd8d0d6, 0x9a2a4a, 0xe08aa8, 0x7a2a6a].map(rgb);
/** The board surround's width either side of a house window (its lintel 0.16). */
const SURROUND_W = 0.1;
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

function uvOffset(ctx: RegionalBuildContext): [number, number] {
  return [ctx.rng() * 7.31, ctx.rng() * 5.17];
}

/**
 * The base geometry's measured footprint (ctx.bounds; the plot where it is empty). A kit house fills it (the
 * coordinator's rule, 2026-10-05: a kit body short of its base opens a lane the bots drive through).
 */
function footprint(ctx: RegionalBuildContext): { w: number; d: number; cx: number; cz: number } {
  const b = ctx.bounds;
  const ok = Number.isFinite(b.minX) && Number.isFinite(b.maxX) && b.maxX - b.minX > 0.5 && b.maxZ - b.minZ > 0.5;
  const x0 = ok ? b.minX : -ctx.info.w / 2, x1 = ok ? b.maxX : ctx.info.w / 2;
  const z0 = ok ? b.minZ : -ctx.info.d / 2, z1 = ok ? b.maxZ : ctx.info.d / 2;
  return { w: x1 - x0, d: z1 - z0, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 };
}

/** The glazed veranda's panes: small lights in white frames over the boarded dado (their casings: verandaCasing). */
const VERANDA_WINDOW: WindowStyle = { frame: DACHA_TRIM, frameWidth: 0.05, frameOut: 0.03, bars: 'cross', surround: null, sill: null, shutters: null };

/**
 * The attic room's window in the lane gable (+z): two lights in a white frame, cut through the boarded gable (the props
 * census's E2 rule: a gable light is an opening, never glass laid on the boards), a third of the way up the gable.
 */
function atticLight(face: Face, poly: Array<[number, number]>, W: number): HoleRect[] {
  if (face.out[2] < 0.5) return [];
  const base = poly[0][1], rise = Math.max(...poly.map(([, y]) => y)) - base;
  if (rise < 1.6) return [];
  const gh = clamp(rise * 0.34, 0.7, 1.1), gw = clamp(W * 0.17, 0.7, 1.0), y0 = base + rise * 0.36 - gh / 2;
  return [{ u0: -gw / 2, u1: gw / 2, y0, y1: y0 + gh }];
}

/**
 * A window's shutter leaves (openings.ts: each hinged at the opening's edge and folded back over the surround onto the
 * wall) need their own width of wall either side: the openings on a face whose leaves would run past the face's ends,
 * into a neighbour's leaves or frame, or over a door and its canopy's brackets, keep none. A rule of the plan, so the same
 * on every tier.
 */
function shutterRoom(o: Opening, openings: readonly Opening[], faceWidth: number): boolean {
  const reach = o.w / 2 + (o.w / 2 + 0.03) + 0.02;
  if (Math.abs(o.u) + reach > faceWidth / 2 - 0.16) return false;
  for (const q of openings) {
    if (q === o || q.face !== o.face || q.storey !== o.storey) continue;
    const other = q.kind === 'door' ? q.w / 2 + 0.75 : q.kind === 'window' ? q.w / 2 + (q.w / 2 + 0.03) + 0.02 : q.w / 2 + 0.2;
    if (Math.abs(q.u - o.u) < reach + other + 0.04) return false;
  }
  return true;
}

/**
 * A veranda light's casing: the board round it in the dado's paint, as wide as the pier to its neighbour allows (two
 * casings and a finger of wall between), never under 3 cm.
 */
function verandaCasing(o: Opening, openings: readonly Opening[], paint: Rgb): WindowStyle['surround'] {
  let gap = 0.12;
  for (const q of openings) {
    if (q === o || q.face !== o.face) continue;
    gap = Math.min(gap, Math.abs(q.u - o.u) - (q.w + o.w) / 2);
  }
  const width = clamp((gap - 0.012) / 2, 0.03, 0.05);
  return { bucket: 'structureWood', width, out: 0.025, lintel: width, colour: paint };
}

/** The desktop craft's choices for one dacha (the facade stream: a phone and the build stream see the house as before). */
interface DachaCraft {
  /** the carved nalychnyky's crest (its peak, rise and the apron's drop), or none: a sawn pediment where room allows */
  crest: { peak: CrestStyle['peak']; rise: number; drop: number } | null;
  /** the carving's second paint, and the shutters' painted border and motif */
  field: Rgb;
  shutterPaint: { border: Rgb; motif: 'diamond' | 'heart' | null };
  tsokol: Rgb | null;
  carvedVerge: boolean;
  dormer: boolean;
  canopy: boolean;
  malvy: Rgb | null;
  bench: boolean;
  firewood: boolean;
}

function dachaCraft(trim: Rgb, paint: Rgb): DachaCraft {
  const f = facadeRng();
  const other = trim === DACHA_TRIM ? paint : DACHA_TRIM;
  const roll = f(), carved = f() < 0.75, rise = 0.12 + f() * 0.06, drop = 0.18 + f() * 0.08;
  const motif = f(), painted = f() < 0.6, tsokol = pick(f, TSOKOL);
  const carvedVerge = f() < 0.6, dormer = f() < 0.55, canopy = f() < 0.85;
  const malvy = f() < 0.65, bloom = pick(f, MALVY), seat = f() < 0.55, firewood = f() < 0.5;
  return {
    crest: carved ? { peak: roll < 0.5 ? 'gable' : roll < 0.8 ? 'arch' : 'stepped', rise, drop } : null,
    field: shade(other, 0.86),
    shutterPaint: { border: other, motif: motif < 0.45 ? 'diamond' : motif < 0.7 ? 'heart' : null },
    tsokol: painted ? tsokol : null,
    carvedVerge, dormer, canopy, malvy: malvy ? bloom : null, bench: seat, firewood,
  };
}

/** A face moved out to stand on the plinth's edge (a bench's feet, a woodpile's back against the plinth, not in it). */
function offFace(face: Face, out: number): Face {
  return { ...face, origin: facePoint(face, 0, 0, out) };
}

/**
 * The open stretch of a face under its windows' aprons for a stack (u0, u1), the widest gap between the openings'
 * surrounds and the face's ends, or null when none is a metre and a half long.
 */
function freeRun(face: Face, openings: readonly Opening[], name: string, margin: number): [number, number] | null {
  const half = face.width / 2 - 0.3;
  const taken = openings.filter((o) => o.face === name).map((o) => [o.u - o.w / 2 - margin, o.u + o.w / 2 + margin] as const).sort((a, b) => a[0] - b[0]);
  let best: [number, number] | null = null, at = -half;
  for (const [a, b] of [...taken, [half, half] as const]) {
    if (a - at > (best ? best[1] - best[0] : 1.5)) best = [at, Math.min(a, half)];
    at = Math.max(at, b);
  }
  return best;
}

/**
 * The dacha: a cottage of one storey in planks or rendered block on a brick plinth under a steep gable of
 * asbestos-cement or painted sheet, the attic room behind its gable light to the lane, a small brick stack, and the
 * glazed veranda down one side (or across the back on a deep lot) under its lean-to — boarded to the sill in the house's
 * paint, small panes above, its door and steps. House and veranda fill the base's footprint; the house's gable faces the
 * lot's +z (the lane). The build stream draws for the body as it did (its walls, roofs and plinths, so its collision);
 * the finish's choices come from a stream of its own (forked once from the look stream) and, on a desktop build, the
 * facade stream.
 */
export const dacha: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  const fp = footprint(ctx);
  const paint = pick(rng, DACHA_PAINT), livery = pick(rng, DACHA_SHEET);
  const wall: RegionalBucket = rng() < 0.35 ? 'plaster' : 'wood';
  const sheet = rng() < 0.55;
  // the veranda down one side on a wide lot, across the back on a deep one
  const sideways = fp.w >= fp.d * 0.8;
  const side = rng() < 0.5 ? 1 : -1;
  const vD = sideways ? clamp(fp.w * 0.3, 1.8, 2.8) : clamp(fp.d * 0.26, 1.8, 2.6);
  const W = Math.max(3.6, sideways ? fp.w - vD : fp.w), D = Math.max(4.4, sideways ? fp.d : fp.d - vD);
  const bx = sideways ? fp.cx - side * vD / 2 : fp.cx, bz = sideways ? fp.cz : fp.cz + vD / 2;
  const pitch = 40 + rng() * 8, wallH = 2.4 + rng() * 0.25, plinth = 0.45;
  // (the finish's own stream: one draw of the look stream, the same on every tier)
  const lift = streamFrom((look() * 4294967296) >>> 0);
  const frameColour = rng() < 0.6 ? DACHA_TRIM : paint, bars = rng() < 0.6 ? 'cross' as const : 'two' as const;
  // every house window in its painted board surround, a rendered house's too (the boarded house's draw kept)
  const trim = wall === 'wood' ? (rng() < 0.6 ? DACHA_TRIM : paint) : (lift() < 0.6 ? DACHA_TRIM : paint);
  const shuttered = lift() < 0.5, shutterColour = lift() < 0.6 ? paint : shade(paint, 0.82);
  const gutterColour = sheet && lift() < 0.5 ? shade(livery, 0.9) : pick(lift, GALVANISED);
  const win: WindowStyle = {
    frame: frameColour, frameWidth: 0.06, frameOut: 0.04, bars,
    surround: { bucket: 'structureWood', width: SURROUND_W, out: 0.03, lintel: 0.16, colour: trim },
    sill: { bucket: 'structureWood', out: 0.06, colour: DACHA_TRIM },
    shutters: shuttered ? { colour: shutterColour, kind: 'plank', closed: 0.12 } : null,
  };
  const craft = facadeOn() ? dachaCraft(trim, paint) : null;
  // the side the veranda does not cover keeps its windows; the lane gable two (or one and the door, with the veranda behind)
  const free: 'left' | 'right' = side > 0 ? 'left' : 'right';
  const openings: Opening[] = sideways
    ? [...windowRhythm('front', 0, W - 0.1, { w: 0.9, h: 1.2, sill: 0.85, spacing: 1.6, margin: 0.7, max: 2 }),
      ...windowRhythm(free, 0, D - 0.1, { w: 0.9, h: 1.2, sill: 0.85, spacing: 2.4, margin: 1.1, max: 2 }),
      ...windowRhythm('back', 0, W - 0.1, { w: 0.8, h: 1.1, sill: 0.95, spacing: 1.6, margin: 1.0, max: 1 })]
    : [{ face: 'front', storey: 0, kind: 'door', u: -(W - 0.1) * 0.22, w: 0.85, y0: 0, h: 1.95 },
      { face: 'front', storey: 0, kind: 'window', u: (W - 0.1) * 0.2, w: 0.9, y0: 0.85, h: 1.2 },
      ...windowRhythm('left', 0, D - 0.1, { w: 0.9, h: 1.2, sill: 0.85, spacing: 2.4, margin: 1.0, max: 2 }),
      ...windowRhythm('right', 0, D - 0.1, { w: 0.9, h: 1.2, sill: 0.85, spacing: 2.4, margin: 1.0, max: 2 })];
  const roof: RoofSpec = { kind: 'gable', pitchDeg: pitch, eave: 0.35, verge: 0.32, thickness: sheet ? 0.06 : 0.1, bucket: sheet ? 'structureMetal' : 'roof', ridge: 'saddle' };
  const attic: WindowStyle = { frame: DACHA_TRIM, frameWidth: 0.06, frameOut: 0.03, bars: 'two', surround: { bucket: 'structureWood', width: 0.08, out: 0.03, colour: DACHA_TRIM }, sill: null, shutters: null };
  // the carved verge's towel board hangs a metre from the apex: only over a gable whose attic light it clears
  const rise = (W - 0.1) / 2 * Math.tan(pitch * Math.PI / 180);
  const atticTop = rise >= 1.6 ? rise * 0.36 + clamp(rise * 0.34, 0.7, 1.1) / 2 : 0;
  const carveVerge = !!craft?.carvedVerge && wall === 'wood' && rise - 1.18 > atticTop + 0.05;
  /**
   * A house window's style: its surround and sill; its shutters where the wall has room for their leaves; on a desktop
   * build the leaves painted and the head carved — the nalychnyk's crest board where the wall over the opening (to the
   * eave, or up a gable to its rake) leaves room for it, a sawn pediment where it leaves less, the plain lintel else.
   * (Under an eave the finial, 3 cm proud, may rise to 7 cm under the wall top: the soffit there is still above it.)
   */
  const houseWindow = (o: Opening, y: number, fr: HouseFrame): WindowStyle => {
    const leaves = win.shutters && shutterRoom(o, fr.spec.openings, o.face === 'front' || o.face === 'back' ? W - 0.1 : D - 0.1);
    const shutters = leaves ? (craft ? { ...win.shutters!, paint: craft.shutterPaint } : win.shutters) : null;
    const style: WindowStyle = { ...win, shutters };
    if (!craft) return style;
    const gable = o.face === 'front' || o.face === 'back', outer = o.w + 2 * SURROUND_W;
    const top = gable ? fr.eaveY + Math.max(0, fr.roof.s - Math.abs(o.u) - outer / 2 - 0.1) * fr.roof.tanP - 0.1 : fr.eaveY - 0.07;
    const room = top - (y + o.h);
    if (craft.crest && room >= 0.37) {
      return { ...style, carved: { crest: { peak: craft.crest.peak, colour: trim, field: craft.field, rise: Math.min(craft.crest.rise, room - 0.29) }, apronDrop: craft.crest.drop } };
    }
    if (room >= 0.17) return { ...style, head: { kind: 'pediment', bucket: 'structureWood', h: 0.08, out: 0.045, ext: 0.03, rise: Math.min(0.1, room - 0.11), colour: trim } };
    return style;
  };
  sink.placed(0, bx, 0, bz, () => {
    const frame = buildHouse(sink, {
      w: W - 0.1, d: D - 0.1, plinth: { h: plinth, out: 0.05, bucket: 'stone' }, storeys: [{ h: wallH, wall }],
      roof, roofColour: sheet ? livery : undefined, gableBucket: 'wood', openings,
      chimneys: [{ x: -side * (W - 0.1) * 0.18, z: -(D - 0.1) * 0.2, sx: 0.42, sz: 0.52, above: 0.6, bucket: 'stone', cap: 'slab' }],
      // the gutters where both eaves are clear (a veranda down one side stands under that eave)
      gutters: sideways ? null : { colour: gutterColour },
      verge: { colour: rng() < 0.5 ? DACHA_TRIM : paint, bucket: 'structureWood', ...(carveVerge ? { carved: trim } : {}) }, reveal: 0.1,
      spall: wall === 'plaster' ? undefined : null,
    }, {
      window: (s, face, o, y0, fr) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, houseWindow(o, y0 + o.y0, fr), rng, 0.4),
      door: (s, face, o, y0, fr) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, {
        leaf: rng() < 0.5 ? paint : DACHA_PLANK, frame: { bucket: 'structureWood', width: 0.09, out: 0.04, colour: DACHA_TRIM },
        steps: { bucket: 'stone' }, leafKind: 'plank',
      }, fr.floors[o.storey] + o.y0),
      gableOpenings: (face, poly) => atticLight(face, poly, W),
    });
    // the attic light's unit, set back in its cut
    const gf = frame.faces.front;
    if (frame.roof.gable) {
      const [hole] = atticLight(gf, frame.roof.gable.map(([u, y]): [number, number] => [u, y]), W);
      if (hole) {
        sink.recess = frame.gableReveal;
        try {
          windowUnit(sink, gf, 0, hole.y0, hole.u1 - hole.u0, hole.y1 - hole.y0, attic, rng, 0.3);
        } finally { sink.recess = 0; }
      }
    }
    // the house's paint on the corner boards and the gable's apron board
    if (wall === 'wood') {
      for (const fx of [-1, 1]) for (const face of [gf, frame.faces.back]) {
        faceBox(sink, 'structureWood', face, fx * ((W - 0.1) / 2 - 0.06), plinth + wallH / 2, 0.03, 0.12, wallH, 0.05, { colour: paint, decor: true, fine: true });
      }
      faceBox(sink, 'structureWood', gf, 0, frame.eaveY + 0.06, 0.04, W - 0.1, 0.14, 0.05, { colour: paint, decor: true });
    }
    if (craft) dachaDressing(sink, frame, craft, { sheet, livery, trim, paint, side, sideways, free, W: W - 0.1, D: D - 0.1, plinth });
    if (look() < 0.5) tvAerial(sink, frame, (look() - 0.5) * D * 0.4, look);
  });
  // the veranda: a body of its own under a lean-to rising to the house wall (its local +x out from the house)
  const vH = 2.2, vPlinth = 0.4;
  const vRoof: RoofSpec = { kind: 'shed', pitchDeg: 12, eave: 0.25, verge: 0.2, thickness: sheet ? 0.06 : 0.1, bucket: sheet ? 'structureMetal' : 'roof', ridge: null };
  const vLen = sideways ? D : W;
  const vOpen: Opening[] = [
    { face: 'front', storey: 0, kind: 'door', u: sideways ? 0 : (side > 0 ? -1 : 1) * (vD / 2 - 0.6), w: 0.82, y0: 0, h: 1.95 },
    ...windowRhythm('right', 0, vLen - 0.06, { w: 0.62, h: 0.95, sill: 1.0, spacing: 0.72, margin: 0.3 }),
    ...windowRhythm('back', 0, vD - 0.06, { w: 0.62, h: 0.95, sill: 1.0, spacing: 0.72, margin: 0.3, max: 2 }),
  ];
  // sideways: the veranda's local frame is the house's turned by 0 (side +1) or π (side -1), its +x away from the house;
  // across the back: turned a quarter so its +x runs out to the lot's -z. (The looks lane, 227: the quarter was turned
  // the wrong way, -π/2 putting its +x toward the house — PartSink.placed: local +x goes to (cos yaw, -sin yaw) — so every
  // Kestrel dacha's glazing faced its own back wall 8 cm away, its blank boards faced the yard and its lean-to fell onto
  // the house. Its footprint is the same rectangle either way round.)
  const vyaw = sideways ? (side > 0 ? 0 : Math.PI) : Math.PI / 2;
  const vx = sideways ? fp.cx + side * (fp.w / 2 - vD / 2) : fp.cx, vz = sideways ? fp.cz : fp.cz - fp.d / 2 + vD / 2;
  sink.placed(vyaw, vx, 0, vz, () => {
    const vf = buildHouse(sink, {
      w: vD - 0.06, d: vLen - 0.06, plinth: { h: vPlinth, out: 0.03, bucket: 'stone' }, storeys: [{ h: vH, wall: 'wood' }],
      roof: vRoof, roofColour: sheet ? livery : undefined, openings: vOpen, chimneys: [], gutters: null, verge: null, reveal: 0.05, spall: null,
    }, {
      window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { ...VERANDA_WINDOW, surround: verandaCasing(o, vOpen, paint) }, rng, 0.35),
      door: (s, face, o, y0, fr) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, {
        leaf: paint, frame: { bucket: 'structureWood', width: 0.08, out: 0.03, colour: DACHA_TRIM }, steps: { bucket: 'stone' }, leafKind: 'panel',
      }, fr.floors[o.storey] + o.y0),
    });
    // the boarded dado in the house's paint along the open sides, a rail at the sill
    const L = vLen - 0.06, w = vD - 0.06;
    const outer: Face = { origin: [w / 2, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: L };
    faceBox(sink, 'structureWood', outer, 0, vPlinth + 0.5, 0.03, L - 0.04, 0.95, 0.04, { colour: paint, decor: true });
    faceBox(sink, 'structureWood', outer, 0, vPlinth + 0.98, 0.06, L, 0.07, 0.08, { colour: DACHA_TRIM, decor: true }, 'ends');
    // the lean-to leaves two triangles open over its ends: boarded
    const rise = w * Math.tan(12 * Math.PI / 180);
    const front: Face = { origin: [0, 0, L / 2], u: [1, 0, 0], out: [0, 0, 1], width: w };
    const back: Face = { origin: [0, 0, -L / 2], u: [-1, 0, 0], out: [0, 0, -1], width: w };
    wallPolygon(sink, 'wood', front, [[-w / 2, vf.eaveY], [w / 2, vf.eaveY], [-w / 2, vf.eaveY + rise]], 0.12);
    wallPolygon(sink, 'wood', back, [[-w / 2, vf.eaveY], [w / 2, vf.eaveY], [w / 2, vf.eaveY + rise]], 0.12);
    if (craft) {
      // (desktop) the veranda's plinth in the house's coat; on a lot where it carries the entrance, its door's canopy
      if (craft.tsokol) plinthPaint(sink, 'plaster', [w / 2, L / 2], 0.03, -0.6, vPlinth, craft.tsokol);
      if (sideways && craft.canopy) {
        const door = vOpen[0];
        doorCanopy(sink, vf.faces.front, door.u, vf.floors[0] + door.y0 + door.h, door.w, { kind: 'shed', bucket: sheet ? 'structureMetal' : 'roof', ...(sheet ? { colour: livery } : {}), timber: paint, depth: 0.8 });
      }
    }
  });
  return sink.finish();
};

/**
 * A dacha's finish past its windows (desktop craft; every choice from the facade stream, every part dressing): the
 * tsokol's coat; the sheet canopy over the house door; a dormer to the attic room on an asbestos-cement roof, on the slope
 * away from the stack; mal'vy against the lane gable clear of its door and window; a bench under the front window; the
 * firewood under the eave of the side the veranda leaves free, between its windows' aprons.
 */
function dachaDressing(sink: PartSink, frame: HouseFrame, craft: DachaCraft,
  h: { sheet: boolean; livery: Rgb; trim: Rgb; paint: Rgb; side: number; sideways: boolean; free: 'left' | 'right'; W: number; D: number; plinth: number }): void {
  const f = facadeRng();
  const spec = frame.spec, ops = spec.openings;
  const out = (spec.plinth?.out ?? 0) + 0.01;
  if (craft.tsokol && spec.plinth) plinthPaint(sink, 'plaster', [h.W / 2, h.D / 2], spec.plinth.out, -0.6, spec.plinth.h, craft.tsokol);
  const door = ops.find((o) => o.face === 'front' && o.kind === 'door');
  if (door && craft.canopy) {
    doorCanopy(sink, frame.faces.front, door.u, frame.floors[0] + door.y0 + door.h, door.w,
      { kind: 'gable', bucket: h.sheet ? 'structureMetal' : 'roof', ...(h.sheet ? { colour: h.livery } : {}), timber: h.paint, depth: 0.9 });
  }
  // (a dormer's front stands 2.15 m over the eave: only under a ridge well above that, never its cheeks over the ridge)
  if (craft.dormer && !h.sheet && frame.roof.kind === 'gable' && frame.roof.ridgeTopY - frame.eaveY >= 2.45) {
    const dormerWindow: WindowStyle = { frame: DACHA_TRIM, frameWidth: 0.05, frameOut: 0.03, bars: 'two',
      surround: { bucket: 'structureWood', width: 0.08, out: 0.03, lintel: 0.12, colour: h.trim }, sill: { bucket: 'structureWood', out: 0.05, colour: DACHA_TRIM }, shutters: null };
    roofDormers(sink, frame.roof, [h.side > 0 ? 1 : -1], [h.D * 0.14], {
      kind: 'gable', wall: 'wood', covering: 'roof',
      window: (face, u, y, w, hh) => windowUnit(sink, face, u, y, w, hh, dormerWindow, f, 0.3),
    });
  }
  // mal'vy: at the lane gable's corner away from its door, clear of every opening's surround and the door's steps
  const gf = frame.faces.front, half = gf.width / 2;
  const clear = (u: number, face: string) => ops.every((o) => o.face !== face || Math.abs(o.u - u) > o.w / 2 + (o.kind === 'door' ? 1.0 : 0.62));
  if (craft.malvy) {
    for (const u of [half - 0.5, -(half - 0.5)]) {
      if (!clear(u, 'front')) continue;
      hollyhocks(sink, gf, u, craft.malvy, f);
      break;
    }
  }
  // the bench under the front window, its back to the plinth
  const fw = ops.find((o) => o.face === 'front' && o.kind === 'window');
  if (craft.bench && fw && Math.abs(fw.u) + 0.7 < half && (!door || Math.abs(fw.u - door.u) > door.w / 2 + 1.4)) bench(sink, offFace(gf, out), fw.u, 1.2, shade(DACHA_PLANK, 0.95));
  // the firewood under the eave on the free side, between its windows' aprons (the stack under their sills)
  if (craft.firewood) {
    const name = h.sideways ? h.free : (h.side > 0 ? 'left' : 'right');
    const face = frame.faces[name], run = freeRun(face, ops, name, SURROUND_W + 0.12);
    if (run) woodpile(sink, offFace(face, out), run[0], run[1], clamp(1.0 + f() * 0.2, 0.9, 1.15), f);
  }
}

/**
 * The garden shed at the plot's back (the yards' outbuilding): planks or old sheet on a timber frame under a lean-to
 * of asbestos sheet, a plank door; it fills its plot. (227) The firewood stacked by its door.
 */
export const gardenShed: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant, mobile = ctx.tier === 'mobile';
  const fp = footprint(ctx);
  const W = Math.max(1.8, fp.w - 0.06), D = Math.max(1.6, fp.d - 0.06), h = 2.0 + rng() * 0.25;
  const sheetWall = rng() < 0.3, livery = pick(rng, DACHA_SHEET);
  const roof: RoofSpec = { kind: 'shed', pitchDeg: 10, eave: 0.2, verge: 0.15, thickness: 0.06, bucket: 'structureMetal', ridge: null };
  sink.placed(0, fp.cx, 0, fp.cz, () => {
    const doorU = (rng() - 0.5) * Math.max(0, W - 1.2);
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: null, storeys: [{ h, wall: 'wood' }], roof, roofColour: livery,
      openings: [{ face: 'front', storey: 0, kind: 'door', u: doorU, w: 0.8, y0: 0, h: 1.8 }],
      chimneys: [], gutters: null, verge: null, reveal: 0.04, spall: null,
    }, {
      window: () => { /* none */ },
      door: (s, face, o, y0, fr) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, {
        leaf: DACHA_PLANK, frame: { bucket: 'structureWood', width: 0.06, out: 0.03, colour: shade(DACHA_PLANK, 0.85) }, steps: null, leafKind: 'plank',
      }, fr.floors[o.storey] + o.y0),
    });
    const rise = W * Math.tan(10 * Math.PI / 180);
    const front: Face = { origin: [0, 0, D / 2], u: [1, 0, 0], out: [0, 0, 1], width: W };
    const back: Face = { origin: [0, 0, -D / 2], u: [-1, 0, 0], out: [0, 0, -1], width: W };
    // (the boards' top edge 3 cm under the roof's underside at the high end: never a face lying on the roof slab's)
    wallPolygon(sink, 'wood', front, [[-W / 2, frame.eaveY], [W / 2, frame.eaveY], [-W / 2, frame.eaveY + rise - 0.03]], 0.1);
    wallPolygon(sink, 'wood', back, [[-W / 2, frame.eaveY], [W / 2, frame.eaveY], [W / 2, frame.eaveY + rise - 0.03]], 0.1);
    // the lean-to's high side boarded up to the roof (the walls stop at the eave; the slab rises from +x to -x)
    const high: Face = { origin: [-W / 2, 0, 0], u: [0, 0, 1], out: [-1, 0, 0], width: D };
    wallPolygon(sink, 'wood', high, [[-D / 2, frame.eaveY], [D / 2, frame.eaveY], [D / 2, frame.eaveY + rise - 0.03], [-D / 2, frame.eaveY + rise - 0.03]], 0.1);
    // an old sheet patched over one side
    if (sheetWall) {
      const sf: Face = { origin: [W / 2, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: D };
      faceBox(sink, 'structureMetal', sf, 0, h * 0.45, 0.03, D * 0.8, h * 0.8, 0.03, { colour: shade(livery, 0.85), decor: true });
    }
    // (227) the winter's firewood stacked against the front beside the door, on its wider side (the shed's sides and back
    // stand a hand off the yard's fences; its front faces the yard): dressing, so a phone draws the look stream for it and
    // keeps none of it
    const lo = doorU - 0.4 - 0.06 - 0.08, hi = doorU + 0.4 + 0.06 + 0.08;
    const [u0, u1] = lo + W / 2 >= W / 2 - hi ? [-W / 2 + 0.1, lo] : [hi, W / 2 - 0.1];
    if (u1 - u0 >= 0.55) sink.dressing(mobile, () => woodpile(sink, front, u0, u1, 0.9 + look() * 0.3, look));
  });
  return sink.finish();
};

/** The dachas' garden plots (yards.ts): a picket fence round the yard and its picket wicket (the fence family's gate, gateKit), the garden shed at its back, the beds. */
export const DACHA_YARD: YardStyle = { kinds: ['cottage'], fence: 'fencepicket', gate: 'gatepicket', shed: 'woodshed', shedSize: [2.6, 2.2], garden: true };
