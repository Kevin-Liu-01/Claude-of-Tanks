// src/world/maps/regional/skylineDeco.ts — the skyline kit's inter-war deco tower as the Shanghai kit's Bund towers build it
// (shanghaiBund.ts bundTower: arcology, megatower, needletower), copied from skyline.ts decoTower as it was (the looks
// lane's r2 sweep, sub-stream b-east, 2026-10-16: lane B is parked, so the builder is taken extract-then-own; skyline.ts
// keeps its own for the generic city kit) and rebuilt here on the r2 standard.
//
// The r2 sweep measured the Bund towers 0.62-0.64 plain boxes by area (blackglass): every pier a bare box up the shaft,
// every spandrel a bare slab. Their tiers are the skyline kit's (towerTier, dressFace), copied as decoTier and decoFace,
// with the piers built as deco piers of two orders (the front order stepped in) and each spandrel a panel with its
// weathered sill course; the dark core, the glass, the damage and every stream as before.
import { faceBox, facePanel, facePoint, PartSink, rgb, type EmitOptions, type Face, type RegionalBucket, type Rgb } from './geometry.ts';
import { hash01 } from './facade.ts';
import { recordBody } from './house.ts';
import type { RegionalBuilder } from './types.ts';
import { GILT, WHITE_TRIM, bankOf, glyph, streetLifeRng } from './shanghaiParts.ts';
import {
  BRONZE, CHAR, COPPER, DECOR, STEEL, cornerBays, cornerCut, damageOf, fit, inset, podium, pyramidCrown, rectFaces, rubble,
  skylineUvOffset as uvOffset, soot, spire, tierDamage, type Rect, type SkylineOptions, type TierDamage, type TowerFacade,
} from './skyline.ts';

type Crown = 'pyramid' | 'stepped' | 'needle';

/**
 * (the owner, 2026-10-21: the Shanghai skyscrapers "are underdesigned") a Bund tower's dress, by its crown, where every
 * tower wore the same brown brick grid: the pyramid's Sassoon House in granite over dark bronze spandrels, the stepped
 * crown's Broadway Mansions and Park Hotel in their brown brick over darker spandrels, the needle's tower in pale stone
 * over green-black spandrels; the accent of its friezes and crown.
 */
const DRESSES: Readonly<Record<Crown, { wall: RegionalBucket; spandrel: { bucket: RegionalBucket; colour?: Rgb; shade?: number }; accent: Rgb }>> = {
  pyramid: { wall: 'plaster3', spandrel: { bucket: 'structureMetal', colour: rgb(0x3a3128) }, accent: COPPER },
  stepped: { wall: 'stone', spandrel: { bucket: 'stone', shade: 0.62 }, accent: GILT },
  needle: { wall: 'plaster2', spandrel: { bucket: 'structureMetal', colour: rgb(0x2c3a34) }, accent: GILT },
};

/** A rect less the part of it a corner void (a collapsed corner's) takes: cut on the side that loses the less. */
function clearOf(r: Rect, v: Rect): Rect {
  const ox = Math.min(r.x1, v.x1) - Math.max(r.x0, v.x0), oz = Math.min(r.z1, v.z1) - Math.max(r.z0, v.z0);
  if (ox <= 0 || oz <= 0) return r;
  const atX1 = v.x1 >= r.x1 - 1e-3, atZ1 = v.z1 >= r.z1 - 1e-3;
  const byX: Rect = atX1 ? { ...r, x1: v.x0 - 0.2 } : { ...r, x0: v.x1 + 0.2 };
  const byZ: Rect = atZ1 ? { ...r, z1: v.z0 - 0.2 } : { ...r, z0: v.z1 + 0.2 };
  const area = (q: Rect) => Math.max(0, q.x1 - q.x0) * Math.max(0, q.z1 - q.z0);
  return area(byX) >= area(byZ) ? byX : byZ;
}

const within = (v: Rect | null, x: number, z: number, m: number) => !!v && x > v.x0 - m && x < v.x1 + m && z > v.z0 - m && z < v.z1 + m;

/**
 * The piers carried up past a tier's parapet as finials, a bay apart round the tier (skyline.ts pierFinials), none over a
 * collapsed corner's void: there they stood on the parapet laid over nothing.
 */
function deckFinials(sink: PartSink, r: Rect, y: number, bay: number, bucket: RegionalBucket, gone: Rect | null): void {
  for (const face of rectFaces(r)) {
    const n = Math.max(1, Math.round(face.width / bay)), bw = face.width / n;
    for (let k = 0; k <= n; k++) {
      const u = -face.width / 2 + k * bw, corner = k === 0 || k === n, p = facePoint(face, u, 0, 0);
      if (within(gone, p[0], p[2], 0.4)) continue;
      const h = corner ? 1.6 : 1.0;
      faceBox(sink, bucket, face, u, y + h / 2, 0.26, corner ? 0.8 : 0.5, h, 0.5, { ...DECOR, fineSides: true }, { bottom: true });
    }
  }
}

/**
 * The Art Deco chevrons along a setback's parapet: a band of raised stepped triangles 10 cm proud, between the parapet's
 * foot and its finials (none over a collapsed corner's void).
 */
function chevrons(sink: PartSink, r: Rect, y: number, bucket: RegionalBucket, gone: Rect | null): void {
  for (const face of rectFaces(r)) {
    const n = Math.max(2, Math.round(face.width / 1.1)), w = face.width / n;
    for (let k = 0; k < n; k++) {
      const u = -face.width / 2 + (k + 0.5) * w, p = facePoint(face, u, 0, 0);
      if (within(gone, p[0], p[2], 0.6)) continue;
      sink.prism(bucket, [facePoint(face, u - w * 0.42, y), facePoint(face, u + w * 0.42, y), facePoint(face, u, y + 0.5)], face.out, 0.1, DECOR);
      sink.prism(bucket, [facePoint(face, u - w * 0.22, y), facePoint(face, u + w * 0.22, y), facePoint(face, u, y + 0.27)], face.out, 0.16, DECOR);
    }
  }
}

/**
 * A face's centre spine: two fins of the deco pier, deeper and wider than the rest, framing its middle bay (two bays on an
 * even count) from the tier's foot past its parapet, the stepped panel between them over the parapet and the accent's
 * blade at its head — the vertical every Bund tower of the thirties drew up its front.
 */
function spine(sink: PartSink, face: Face, y0: number, top: number, bay: number, bucket: RegionalBucket, accent: Rgb): void {
  const n = Math.max(1, Math.round(face.width / bay)), bw = face.width / n;
  const half = n % 2 ? bw / 2 : bw, head = top + 2.6;
  for (const s of [-1, 1]) steppedPier(sink, bucket, face, s * half, y0, head, 0.95, 0.95, { ...DECOR, fineSides: true, shadow: true });
  const pw = 2 * half - 0.95;
  faceBox(sink, bucket, face, 0, (top + 0.9 + head) / 2, 0.25, pw, head - top - 0.9, 0.5, { ...DECOR, shadow: true });
  faceBox(sink, bucket, face, 0, head + 0.45, 0.2, pw * 0.62, 0.9, 0.4, { ...DECOR, shadow: true });
  faceBox(sink, 'structureMetal', face, 0, head + 0.9 + 0.7, 0.2, 0.26, 1.4, 0.36, { ...DECOR, colour: accent });
}

/**
 * A blade sign hung edge-on off a pier's front (the hotels' and the department stores' names down their towers): its
 * board and the characters down both sides, an iron bracket top and bottom. (u, y0) the pier and the board's foot.
 */
function bladeSign(sink: PartSink, face: Face, u: number, y0: number, h: number, out: number, board: Rgb, ink: Rgb, rng: () => number): void {
  const reach = 1.25, oc = out + reach / 2;
  faceBox(sink, 'structureWood', face, u, y0 + h / 2, oc, 0.26, h, reach, { ...DECOR, colour: board, shadow: true });
  for (const s of [-1, 1]) {
    // the board's side as a face of its own, its u along the reach
    const side: Face = { origin: facePoint(face, u + s * 0.13, 0, 0), u: [face.out[0] * s, 0, face.out[2] * s], out: [face.u[0] * s, 0, face.u[2] * s], width: reach };
    const n = Math.max(2, Math.min(7, Math.floor(h / (reach * 0.95)))), cell = Math.min(reach * 0.62, h / n / 1.2);
    for (let k = 0; k < n; k++) {
      glyph(s * oc, y0 + h - (k + 0.5) * h / n, cell, rng, (u0, u1, a, b) =>
        faceBox(sink, 'structureWood', side, (u0 + u1) / 2, (a + b) / 2, 0.006, u1 - u0, b - a, 0.012, { ...DECOR, colour: ink, fine: true }));
    }
  }
  for (const y of [y0 + 0.3, y0 + h - 0.3]) faceBox(sink, 'structureMetal', face, u, y, out + 0.15, 0.08, 0.08, 0.3, { ...DECOR, colour: STEEL });
}

/**
 * The art-deco tower of the Bund: a granite podium, a shaft of continuous piers over recessed spandrels in two or three
 * setbacks, the crown a copper pyramid (Sassoon House), a stepped crown with a flagstaff (Broadway Mansions) or a needle.
 */
export function decoTower(opts: SkylineOptions & { crown?: 'pyramid' | 'stepped' | 'needle' } = {}): RegionalBuilder {
  return (ctx) => {
    const sink = new PartSink(uvOffset(ctx));
    const rng = ctx.rng;
    const damage = damageOf(ctx, opts.damage);
    const plot = fit(ctx, 12, 12);
    const crown = opts.crown ?? (['pyramid', 'stepped', 'needle'] as const)[Math.floor(rng() * 3)];
    const stone: RegionalBucket = 'stone';
    // (230) the tower's dress (DRESSES); what the round adds draws from the street's own stream (streetLifeRng)
    const dress = DRESSES[crown], wall = dress.wall, life = streetLifeRng(ctx);
    const podiumH = 8.5;
    // (230) the podium in the granite every Bund tower stood on, its cornice proud over the street (the brick before)
    podium(sink, plot, podiumH, 'plaster3', rng, { arcade: rng() < 0.5 });
    sink.span('plaster3', plot.x0 - 0.3, podiumH - 0.45, plot.z0 - 0.3, plot.x1 + 0.3, podiumH + 0.05, plot.z1 + 0.3, { ...DECOR, shadow: true });
    // (props census #9, E13: the tower reader) the podium and the shaft (its first tier's plan, to the crown, in storey
    // bands) as bodies for the damage reading: the podium breaks as a house, the shaft topples
    recordBody(sink, (plot.x0 + plot.x1) / 2, (plot.z0 + plot.z1) / 2, plot.x1 - plot.x0, plot.z1 - plot.z0, podiumH, stone);
    // the vertical line of the deco shaft: piers standing well out, the spandrels set back between them and darker
    const facade: TowerFacade = {
      pier: { bucket: wall, w: 0.66, out: 0.5 }, spandrel: { ...dress.spandrel, h: 1.1, out: 0.07 },
      bay: 2.2, lit: 0.32, glazing: 'bays', mullions: 1, mullion: BRONZE,
    };
    const total = opts.floors ?? Math.max(6, Math.min(22, Math.round((ctx.info.h > 20 ? ctx.info.h : 48) / 3.6)));
    const fh = 3.6;
    // the shaft in tiers: each a setback over the last, the top one carrying the crown
    const tiers = total > 12 ? 3 : 2;
    let r = inset(plot, Math.min(1.2, (plot.x1 - plot.x0) * 0.05));
    const r0 = r;
    let y = podiumH, left = total;
    const first = Math.round(total * 0.55);
    const dmg = tierDamage(rng, damage, first);
    for (let t = 0; t < tiers; t++) {
      const n = t === tiers - 1 ? left : t === 0 ? first : Math.round(total * 0.28);
      const tierDmg = t === 0 ? dmg : { ...dmg, corner: null, blown: null, burnt: new Set<number>(), holes: dmg.holes.filter((h) => h.floor < n) };
      const { top, gone, keep } = decoTier(sink, r, y, n, fh, facade, tierDmg, rng);
      // the setback: the piers carried up past the parapet as finials, the terrace parapet between them
      // (from the tier's top: run 0.3 m down it stood behind the top floor's glass, the pane on stone instead of the dark)
      // (the owner, 2026-10-21: the towers' "floating parts") over a collapsed corner the parapet and its finials stand on
      // the tier's standing L only: they were laid across the void, a roof and its finials over nothing
      for (const part of keep ?? [r]) sink.span(wall, part.x0, top, part.z0, part.x1, top + 0.9, part.z1);
      deckFinials(sink, r, top + 0.9, facade.bay, wall, gone);
      // (230, "underdesigned") the Art Deco chevrons along the setback's parapet; up each wide face of the first tier its
      // centre spine
      chevrons(sink, r, top + 0.12, wall, gone);
      if (t === 0) for (const face of rectFaces(r)) if (face.width >= 12) spine(sink, face, y, top, facade.bay, wall, dress.accent);
      left -= n; y = top;
      if (left <= 0) break;
      const k = Math.min((r.x1 - r.x0) * 0.16, (r.z1 - r.z0) * 0.16, 3.2);
      r = inset(r, k);
      // (the owner, 2026-10-21) the tier over a collapsed corner stands back from its void: it stood out over it
      if (gone) r = clearOf(r, gone);
    }
    // (230) a blade sign down a Settlement tower's first tier, the hotel's or the store's name (the Park Hotel's, Sun Sun's)
    if (bankOf(ctx) !== 'zhabei' && damage <= 1 && first >= 5 && life() < 0.5) {
      const face = rectFaces(r0)[life() < 0.5 ? 0 : 2], n = Math.max(1, Math.round(face.width / facade.bay)), bw = face.width / n;
      const side = life() < 0.5 ? -1 : 1, foot = podiumH + fh * 1.3, h = Math.min(16, (first - 1.6) * fh);
      const boards: readonly Rgb[] = [rgb(0x7f2420), rgb(0x1d1c1b), rgb(0x23402f)];
      bladeSign(sink, face, side * (face.width / 2 - bw), foot, h, facade.pier!.out, boards[Math.floor(life() * boards.length) % boards.length],
        life() < 0.5 ? GILT : WHITE_TRIM, life);
    }
    // the crown
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, half = Math.min(r.x1 - r.x0, r.z1 - r.z0) / 2;
    {
      const r0 = inset(plot, Math.min(1.2, (plot.x1 - plot.x0) * 0.05));
      recordBody(sink, (r0.x0 + r0.x1) / 2, (r0.z0 + r0.z1) / 2, r0.x1 - r0.x0, r0.z1 - r0.z0, y + 0.9, stone, false, true);
    }
    // (230) the crown's accent band round a drum's head (gilt, or the pyramid's copper), seated on its face
    const band = (rr: Rect, yb: number) => {
      for (const face of rectFaces(rr)) faceBox(sink, 'structureMetal', face, 0, yb, 0.06, face.width + 0.12, 0.2, 0.12, { ...DECOR, colour: dress.accent });
    };
    if (damage === 3) {
      // the crown shot away: its stump and the broken frame
      sink.span(wall, cx - half * 0.6, y + 0.9, cz - half * 0.6, cx + half * 0.6, y + 3.1, cz + half * 0.6);
    } else if (crown === 'pyramid') {
      const dr: Rect = { x0: cx - half * 0.86, x1: cx + half * 0.86, z0: cz - half * 0.86, z1: cz + half * 0.86 };
      sink.span(wall, dr.x0, y + 0.9, dr.z0, dr.x1, y + 4.1, dr.z1);
      // (230) the drum's clerestory under its band, the pyramid steeper: Sassoon House's rises near twice its half
      for (const face of rectFaces(dr)) {
        const n = Math.max(2, Math.round(face.width / 1.5)), w = face.width / n;
        for (let k = 0; k < n; k++) facePanel(sink, k % 2 ? 'glass' : 'curtain', face, -face.width / 2 + (k + 0.5) * w, y + 2.45, 0.02, w * 0.55, 1.8, { ...DECOR, window: face.out });
      }
      band(dr, y + 3.95);
      pyramidCrown(sink, cx, cz, half * 0.92, y + 4.1, half * 2.0, COPPER);
    } else if (crown === 'stepped') {
      // the ziggurat crown: three stepped drums, each ringed by fins, a flagstaff on the last
      let s = half * 0.82, yy = y + 0.9;
      for (let k = 0; k < 3; k++) {
        sink.span(wall, cx - s, yy, cz - s, cx + s, yy + 2.6, cz + s);
        for (const face of rectFaces({ x0: cx - s, x1: cx + s, z0: cz - s, z1: cz + s })) {
          // (the fins stand 0.6 m over the drum: their backs drawn, a centimetre off it)
          for (let f = -1; f <= 1; f++) faceBox(sink, wall, face, f * s * 0.55, yy + 1.6, 0.19, 0.28, 3.2, 0.36, { ...DECOR, fineSides: true });
        }
        band({ x0: cx - s, x1: cx + s, z0: cz - s, z1: cz + s }, yy + 2.45);
        yy += 2.6; s *= 0.7;
      }
      sink.cylinder('structureMetal', [cx, yy, cz], 'y', 9, 0.1, 6, { ...DECOR, colour: STEEL }, 0.05);
      // (230) the beacon at the staff's head
      sink.cylinder('structureMetal', [cx, yy + 8.95, cz], 'y', 0.6, 0.26, 8, { ...DECOR, colour: dress.accent }, 0.1);
    } else {
      sink.span(wall, cx - half * 0.5, y + 0.9, cz - half * 0.5, cx + half * 0.5, y + 5.4, cz + half * 0.5);
      band({ x0: cx - half * 0.5, x1: cx + half * 0.5, z0: cz - half * 0.5, z1: cz + half * 0.5 }, y + 5.25);
      spire(sink, cx, cz, y + 5.4, half * 0.42, half * 3.2, COPPER, null);
    }
    return sink.finish();
  };
}

/**
 * A section (o out of the face, y) run along a face from u0 to u1: its sides (the section's segments; none along o = 0,
 * the wall) and its two end caps (the section fanned; convex).
 */
export function faceSection(sink: PartSink, bucket: RegionalBucket, face: Face, u0: number, u1: number, sec: ReadonlyArray<readonly [number, number]>, opts: EmitOptions): void {
  for (let i = 0; i + 1 < sec.length; i++) {
    const [oa, ya] = sec[i], [ob, yb] = sec[i + 1];
    if (oa < 1e-6 && ob < 1e-6) continue;
    sink.quad(bucket, facePoint(face, u0, ya, oa), facePoint(face, u1, ya, oa), facePoint(face, u1, yb, ob), facePoint(face, u0, yb, ob), opts);
  }
  sink.polygon(bucket, sec.map(([o, y]) => facePoint(face, u0, y, o)), opts);
  sink.polygon(bucket, [...sec].reverse().map(([o, y]) => facePoint(face, u1, y, o)), opts);
}

/**
 * A deco pier of two orders standing from y0 to y1 at u: the back order `w` wide from the wall out to 55 % of `out`, the
 * front order 9 cm narrower a side out to `out`; its sides and front, its head
 * capped (the foot stands on the podium or the setback).
 */
export function steppedPier(sink: PartSink, bucket: RegionalBucket, face: Face, u: number, y0: number, y1: number, w: number, out: number, opts: EmitOptions): void {
  const h = w / 2, f = Math.max(0.08, h - 0.09), o1 = out * 0.55;
  // the plan section round the pier (u, o), from the wall on its left round to the wall on its right
  const sec: Array<[number, number]> = [[-h, 0], [-h, o1], [-f, o1], [-f, out], [f, out], [f, o1], [h, o1], [h, 0]];
  const at = (s: readonly [number, number], y: number) => facePoint(face, u + s[0], y, s[1]);
  for (let i = 0; i + 1 < sec.length; i++) sink.quad(bucket, at(sec[i], y0), at(sec[i + 1], y0), at(sec[i + 1], y1), at(sec[i], y1), opts);
  // the head: the section's plan fanned (two convex parts: the back order, the front order)
  // (counter-clockwise from above: the face's u turned toward its out is clockwise, so the sections run back)
  sink.polygon(bucket, [at([-h, o1], y1), at([h, o1], y1), at([h, 0], y1), at([-h, 0], y1)], opts);
  sink.polygon(bucket, [at([-f, out], y1), at([f, out], y1), at([f, o1], y1), at([-f, o1], y1)], opts);
}

/**
 * A tier of a tower: its structural prism (the dark core: the building's body and its collision, the void behind every
 * missing pane) from `y0` up `floors` storeys of `fh`, and its faces dressed by `facade`. With a collapsed corner the
 * prism above the corner's floor is the L left standing. Returns the tier's top height, and with a collapsed corner its
 * void and the L's parts (the setback's parapet stands on those).
 */
function decoTier(sink: PartSink, r: Rect, y0: number, floors: number, fh: number, facade: TowerFacade, dmg: TierDamage,
  rng: () => number, opts: { base?: number; faces?: readonly boolean[] } = {}): { top: number; gone: Rect | null; keep: Rect[] | null } {
  const top = y0 + floors * fh, base = opts.base ?? y0;
  let gone: Rect | null = null, keep: Rect[] | null = null;
  const faces = rectFaces(r);
  const bays = faces.map((f) => Math.max(1, Math.round(f.width / facade.bay)));
  // the core: whole below a collapse, an L above it
  const c = dmg.corner;
  if (c && c.floor < floors) {
    const yc = y0 + c.floor * fh;
    sink.span('dark', r.x0, base, r.z0, r.x1, yc, r.z1);
    const cut = cornerCut(r, c.face, faces, bays, c.bays);
    gone = cut.void.rect; keep = cut.keep;
    for (const part of cut.keep) sink.span('dark', part.x0, yc, part.z0, part.x1, top, part.z1);
    // the floor slabs broken off along the void's inner edges: ragged ends standing into it, some hanging, and the
    // rubble come down on the floor it broke at
    const v = cut.void.rect, sx = Math.sign(cut.void.dx), sz = Math.sign(cut.void.dz);
    const ex = sx > 0 ? v.x0 : v.x1, ez = sz > 0 ? v.z0 : v.z1;
    for (let f = c.floor + 1; f <= floors; f++) {
      const y = y0 + f * fh;
      for (let k = 0; k < 4; k++) {
        const h1 = hash01(f, k, ex, 2.1), h2 = hash01(f, k, ez, 3.7);
        // along the x edge (into the void along +sx), then along the z edge
        const zA = v.z0 + (v.z1 - v.z0) * (k + 0.15) / 4, zB = v.z0 + (v.z1 - v.z0) * (k + 0.85) / 4, reach = 0.4 + h1 * 2.2;
        if (h2 < 0.35) sink.member('plaster3', [ex, y - 0.1, (zA + zB) / 2], [ex + sx * reach, y - 0.1 - reach * (0.3 + h2), (zA + zB) / 2], zB - zA, 0.24, [0, 1, 0], { ...DECOR, exposed: true }, 0.12);
        else if (f < floors) sink.span('plaster3', Math.min(ex, ex + sx * reach), y - 0.22, zA, Math.max(ex, ex + sx * reach), y, zB, DECOR);
        const xA = v.x0 + (v.x1 - v.x0) * (k + 0.15) / 4, xB = v.x0 + (v.x1 - v.x0) * (k + 0.85) / 4, reach2 = 0.4 + h2 * 2.2;
        if (h1 < 0.3) sink.member('plaster3', [(xA + xB) / 2, y - 0.1, ez], [(xA + xB) / 2, y - 0.1 - reach2 * (0.3 + h1), ez + sz * reach2], xB - xA, 0.24, [0, 1, 0], { ...DECOR, exposed: true }, 0.12);
        else if (f < floors) sink.span('plaster3', xA, y - 0.22, Math.min(ez, ez + sz * reach2), xB, y, Math.max(ez, ez + sz * reach2), DECOR);
      }
    }
    rubble(sink, v, yc, 1.4 + (top - yc) * 0.04, rng);
  } else sink.span('dark', r.x0, base, r.z0, r.x1, top, r.z1);
  faces.forEach((face, fi) => {
    if (opts.faces && !opts.faces[fi]) return;
    decoFace(sink, face, fi, bays[fi], y0, floors, fh, facade, dmg, c ? { floor: c.floor, from: cornerBays(c, fi, bays[fi]) } : null);
  });
  return { top, gone, keep };
}

/** Dress one face of a tier: piers, per-floor spandrels and glass, damage. */
function decoFace(sink: PartSink, face: Face, fi: number, bays: number, y0: number, floors: number, fh: number, facade: TowerFacade,
  dmg: TierDamage, corner: { floor: number; from: { end: 1 | -1; n: number } | null } | null): void {
  const W = face.width, bw = W / bays, sp = facade.spandrel, pier = facade.pier;
  const glassO = 0.03;
  const cornerGone = (bay: number, floor: number) => !!corner?.from && floor >= corner.floor
    && (corner.from.end > 0 ? bay >= bays - corner.from.n : bay < corner.from.n);
  // (props census #9) a shell's hit blows out the bay it struck (or the two it straddles), the facade gone to its slab and
  // the dark behind: it was a dark star painted on the piers and the spandrel
  const struck = dmg.holes.filter((hole) => hole.face === fi && hole.floor < floors && !(corner?.from && hole.floor >= corner.floor)).flatMap((hole) => {
    const at = hole.t * bays, b0 = Math.max(0, Math.min(bays - 1, Math.floor(at - hole.r / bw))), b1 = Math.max(0, Math.min(bays - 1, Math.floor(at + hole.r / bw)));
    return Array.from({ length: b1 - b0 + 1 }, (_, k) => `${b0 + k}:${hole.floor}`);
  });
  const hit = new Set(struck);
  const blown = (bay: number, floor: number) => (!!dmg.blown && dmg.blown.face === fi && bay >= dmg.blown.b0 && bay <= dmg.blown.b1
    && floor >= dmg.blown.f0 && floor <= dmg.blown.f1) || hit.has(`${bay}:${floor}`);
  const spOpts: EmitOptions = { ...DECOR, ...(sp.colour ? { colour: sp.colour } : {}), ...(sp.shade ? { shade: sp.shade } : {}) };
  // each pier's place, width and head (a collapsed corner's piers stop at its floor; the corner piers wider, drawn in)
  const pierAt = (k: number): { u: number; w: number; top: number } => {
    const u = -W / 2 + k * bw, corner0 = k === 0 || k === bays, pw = pier ? (corner0 ? pier.w * 1.2 : pier.w) : 0;
    const goneAbove = corner?.from && ((corner.from.end > 0 && k >= bays - corner.from.n) || (corner.from.end < 0 && k <= corner.from.n));
    return { u: corner0 ? u - Math.sign(u) * pw / 2 : u, w: pw, top: goneAbove ? y0 + corner!.floor * fh : y0 + floors * fh };
  };
  for (let f = 0; f < floors; f++) {
    const y = y0 + f * fh, burnt = dmg.burnt.has(f);
    // the spandrel: one band per run of standing bays (a collapsed corner or a blown bay breaks it)
    let run0 = -1;
    const flush = (b: number) => {
      if (run0 < 0) return;
      const u0 = -W / 2 + run0 * bw, u1 = -W / 2 + b * bw;
      // (looks r2) the spandrel panel with its sill: a weathered sill course along its head, its nose 5 cm proud of the panel
      faceSection(sink, sp.bucket, face, u0, u1, [[0, y], [sp.out, y], [sp.out, y + sp.h - 0.12], [sp.out + 0.05, y + sp.h - 0.1], [0, y + sp.h]],
        { ...spOpts, ...(burnt ? { colour: CHAR, shade: 0.4 } : {}) });
      run0 = -1;
    };
    for (let b = 0; b <= bays; b++) {
      const standing = b < bays && !cornerGone(b, f) && !blown(b, f);
      if (standing && run0 < 0) run0 = b;
      if (!standing) flush(b);
    }
    // the glass: per bay (or one ribbon per run), lit, dark or gone
    for (let b = 0; b < bays; b++) {
      if (cornerGone(b, f)) continue;
      const u = -W / 2 + (b + 0.5) * bw, gw = bw - (pier ? pier.w : 0.06), gy0 = y + sp.h, gy1 = y + fh;
      if (blown(b, f)) {
        // the facade blown off: the slab's broken edge, the void behind
        faceBox(sink, 'plaster3', face, u, y + 0.12, 0.08, bw * 0.9, 0.24, 0.16, { ...DECOR, fineSides: true });
        continue;
      }
      const h = hash01(face.origin[0], face.origin[2], b, f);
      if (burnt || h < dmg.gone) continue; // gone to the dark core
      const lit = h > 1 - facade.lit;
      facePanel(sink, lit ? 'curtain' : 'glass', face, u, (gy0 + gy1) / 2, glassO, gw, gy1 - gy0, { ...DECOR, window: face.out });
      // mullions and the transom (fine joinery)
      if (facade.mullions > 0) {
        for (let m = 1; m <= facade.mullions; m++) {
          const mu = u - gw / 2 + gw * m / (facade.mullions + 1);
          facePanel(sink, 'structureMetal', face, mu, (gy0 + gy1) / 2, glassO + 0.02, 0.05, gy1 - gy0, { ...DECOR, colour: facade.mullion, fine: !facade.coarseMullions });
        }
        facePanel(sink, 'structureMetal', face, u, gy1 - (gy1 - gy0) * 0.25, glassO + 0.02, gw, 0.05, { ...DECOR, colour: facade.mullion, fine: !facade.coarseMullions });
      }
    }
    if (burnt) {
      // soot up the piers and the spandrel over the burnt floor (fine: 8 mm on their fronts, drawn near the camera)
      // (the owner, 2026-10-21: the towers' "floating parts") only where a pier or a spandrel stands: a collapsed
      // corner's piers stop at its floor and the soot laid on from there stood half a metre off the wall over the void
      // (10 m strips); the corner piers' soot on the pier, not half past the tower's edge; the spandrel's over its
      // standing bays, not across a blown or fallen run
      const y1 = Math.min(y + 2.2 * fh, y0 + floors * fh);
      if (pier) {
        for (let k = 0; k <= bays; k++) {
          const p = pierAt(k), top = Math.min(y1, p.top);
          if (top - (y + sp.h) > 0.3) soot(sink, pier.bucket, face, p.u, p.w * 0.9, y + sp.h, top, pier.out + 0.008, pier.colour);
        }
      }
      if (f + 1 < floors) {
        let b0 = -1;
        for (let b = 0; b <= bays; b++) {
          const standing = b < bays && !cornerGone(b, f + 1) && !blown(b, f + 1);
          if (standing && b0 < 0) b0 = b;
          if (!standing && b0 >= 0) {
            const u0 = -W / 2 + b0 * bw + 0.2, u1 = -W / 2 + b * bw - 0.2;
            if (u1 - u0 > 0.3) soot(sink, sp.bucket, face, (u0 + u1) / 2, u1 - u0, y + fh, y + fh + sp.h, sp.out + 0.008, sp.colour);
            b0 = -1;
          }
        }
      }
    }
  }
  // the piers, full height over the standing bays (a collapsed corner's piers stop at its floor)
  if (pier) {
    const pOpts: EmitOptions = { ...DECOR, fineSides: true, ...(pier.colour ? { colour: pier.colour } : {}), ...(pier.shade ? { shade: pier.shade } : {}) };
    for (let k = 0; k <= bays; k++) {
      const p = pierAt(k);
      if (p.top - y0 < 0.5) continue;
      // (looks r2) a deco pier of two orders: its back order the pier's width out to 55 % of its reach, the front order
      // stepped in 9 cm a side (a box before)
      steppedPier(sink, pier.bucket, face, p.u, y0, p.top, p.w, pier.out, pOpts);
    }
  }
}
