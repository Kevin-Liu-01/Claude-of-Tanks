// src/world/maps/regional/skylineDeco.ts — the skyline kit's inter-war deco tower as the Shanghai kit's Bund towers build it
// (shanghaiBund.ts bundTower: arcology, megatower, needletower), copied from skyline.ts decoTower as it was (the looks
// lane's r2 sweep, sub-stream b-east, 2026-10-16: lane B is parked, so the builder is taken extract-then-own; skyline.ts
// keeps its own for the generic city kit) and rebuilt here on the r2 standard.
//
// The r2 sweep measured the Bund towers 0.62-0.64 plain boxes by area (blackglass): every pier a bare box up the shaft,
// every spandrel a bare slab. Their tiers are the skyline kit's (towerTier, dressFace), copied as decoTier and decoFace,
// with the piers built as deco piers of two orders (the front order stepped in, its arrises chamfered) and each
// spandrel a panel with its drip-nosed sill course; the dark core, the glass, the damage and every stream as before.
import { faceBox, facePanel, facePoint, PartSink, type EmitOptions, type Face, type RegionalBucket } from './geometry.ts';
import { hash01 } from './facade.ts';
import { recordBody } from './house.ts';
import type { RegionalBuilder } from './types.ts';
import {
  BRONZE, CHAR, COPPER, DECOR, STEEL, cornerBays, cornerCut, damageOf, faceFrame, fit, inset, pierFinials, podium, pyramidCrown, rectFaces, rubble,
  skylineUvOffset as uvOffset, soot, spire, tierDamage, type Rect, type SkylineOptions, type TierDamage, type TowerFacade,
} from './skyline.ts';

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
    const podiumH = 8.5;
    podium(sink, plot, podiumH, stone, rng, { arcade: rng() < 0.5 });
    // (props census #9, E13: the tower reader) the podium and the shaft (its first tier's plan, to the crown, in storey
    // bands) as bodies for the damage reading: the podium breaks as a house, the shaft topples
    recordBody(sink, (plot.x0 + plot.x1) / 2, (plot.z0 + plot.z1) / 2, plot.x1 - plot.x0, plot.z1 - plot.z0, podiumH, stone);
    // the vertical line of the deco shaft: piers standing well out, the spandrels set back between them and darker
    const facade: TowerFacade = {
      pier: { bucket: stone, w: 0.66, out: 0.5 }, spandrel: { bucket: stone, h: 1.1, out: 0.07, shade: 0.62 },
      bay: 2.2, lit: 0.32, glazing: 'bays', mullions: 1, mullion: BRONZE,
    };
    const total = opts.floors ?? Math.max(6, Math.min(22, Math.round((ctx.info.h > 20 ? ctx.info.h : 48) / 3.6)));
    const fh = 3.6;
    // the shaft in tiers: each a setback over the last, the top one carrying the crown
    const tiers = total > 12 ? 3 : 2;
    let r = inset(plot, Math.min(1.2, (plot.x1 - plot.x0) * 0.05));
    let y = podiumH, left = total;
    const first = Math.round(total * 0.55);
    const dmg = tierDamage(rng, damage, first);
    for (let t = 0; t < tiers; t++) {
      const n = t === tiers - 1 ? left : t === 0 ? first : Math.round(total * 0.28);
      const tierDmg = t === 0 ? dmg : { ...dmg, corner: null, blown: null, burnt: new Set<number>(), holes: dmg.holes.filter((h) => h.floor < n) };
      const top = decoTier(sink, r, y, n, fh, facade, tierDmg, rng);
      // the setback: the piers carried up past the parapet as finials, the terrace parapet between them
      // (from the tier's top: run 0.3 m down it stood behind the top floor's glass, the pane on stone instead of the dark)
      sink.span(stone, r.x0, top, r.z0, r.x1, top + 0.9, r.z1);
      pierFinials(sink, r, top + 0.9, facade.bay, stone);
      left -= n; y = top;
      if (left <= 0) break;
      const k = Math.min((r.x1 - r.x0) * 0.16, (r.z1 - r.z0) * 0.16, 3.2);
      r = inset(r, k);
    }
    // the crown
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, half = Math.min(r.x1 - r.x0, r.z1 - r.z0) / 2;
    {
      const r0 = inset(plot, Math.min(1.2, (plot.x1 - plot.x0) * 0.05));
      recordBody(sink, (r0.x0 + r0.x1) / 2, (r0.z0 + r0.z1) / 2, r0.x1 - r0.x0, r0.z1 - r0.z0, y + 0.9, stone, false, true);
    }
    if (damage === 3) {
      // the crown shot away: its stump and the broken frame
      sink.span(stone, cx - half * 0.6, y + 0.9, cz - half * 0.6, cx + half * 0.6, y + 3.1, cz + half * 0.6);
    } else if (crown === 'pyramid') {
      sink.span(stone, cx - half * 0.86, y + 0.9, cz - half * 0.86, cx + half * 0.86, y + 4.1, cz + half * 0.86);
      pyramidCrown(sink, cx, cz, half * 0.92, y + 4.1, half * 1.5, COPPER);
    } else if (crown === 'stepped') {
      // the ziggurat crown: three stepped drums, each ringed by fins, a flagstaff on the last
      let s = half * 0.82, yy = y + 0.9;
      for (let k = 0; k < 3; k++) {
        sink.span(stone, cx - s, yy, cz - s, cx + s, yy + 2.6, cz + s);
        for (const face of rectFaces({ x0: cx - s, x1: cx + s, z0: cz - s, z1: cz + s })) {
          // (the fins stand 0.6 m over the drum: their backs drawn, a centimetre off it)
          for (let f = -1; f <= 1; f++) faceBox(sink, stone, face, f * s * 0.55, yy + 1.6, 0.19, 0.28, 3.2, 0.36, { ...DECOR, fineSides: true });
        }
        yy += 2.6; s *= 0.7;
      }
      sink.cylinder('structureMetal', [cx, yy, cz], 'y', 9, 0.1, 6, { ...DECOR, colour: STEEL }, 0.05);
    } else {
      sink.span(stone, cx - half * 0.5, y + 0.9, cz - half * 0.5, cx + half * 0.5, y + 5.4, cz + half * 0.5);
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
 * front order 9 cm narrower a side out to `out`, its two front arrises chamfered 4 cm; its sides and front, its head
 * capped (the foot stands on the podium or the setback).
 */
export function steppedPier(sink: PartSink, bucket: RegionalBucket, face: Face, u: number, y0: number, y1: number, w: number, out: number, opts: EmitOptions): void {
  const h = w / 2, f = Math.max(0.08, h - 0.09), o1 = out * 0.55, c = Math.min(0.04, f * 0.3);
  // the plan section round the pier (u, o), from the wall on its left round to the wall on its right
  const sec: Array<[number, number]> = [[-h, 0], [-h, o1], [-f, o1], [-f, out - c], [-f + c, out], [f - c, out], [f, out - c], [f, o1], [h, o1], [h, 0]];
  const at = (s: readonly [number, number], y: number) => facePoint(face, u + s[0], y, s[1]);
  for (let i = 0; i + 1 < sec.length; i++) sink.quad(bucket, at(sec[i], y0), at(sec[i + 1], y0), at(sec[i + 1], y1), at(sec[i], y1), opts);
  // the head: the section's plan fanned (two convex parts: the back order, the front order)
  // (counter-clockwise from above: the face's u turned toward its out is clockwise, so the sections run back)
  sink.polygon(bucket, [at([-h, o1], y1), at([h, o1], y1), at([h, 0], y1), at([-h, 0], y1)], opts);
  sink.polygon(bucket, [at([-f, out - c], y1), at([-f + c, out], y1), at([f - c, out], y1), at([f, out - c], y1), at([f, o1], y1), at([-f, o1], y1)], opts);
}

/**
 * A tier of a tower: its structural prism (the dark core: the building's body and its collision, the void behind every
 * missing pane) from `y0` up `floors` storeys of `fh`, and its faces dressed by `facade`. With a collapsed corner the
 * prism above the corner's floor is the L left standing. Returns the tier's top height.
 */
function decoTier(sink: PartSink, r: Rect, y0: number, floors: number, fh: number, facade: TowerFacade, dmg: TierDamage,
  rng: () => number, opts: { base?: number; faces?: readonly boolean[] } = {}): number {
  const top = y0 + floors * fh, base = opts.base ?? y0;
  const faces = rectFaces(r);
  const bays = faces.map((f) => Math.max(1, Math.round(f.width / facade.bay)));
  // the core: whole below a collapse, an L above it
  const c = dmg.corner;
  if (c && c.floor < floors) {
    const yc = y0 + c.floor * fh;
    sink.span('dark', r.x0, base, r.z0, r.x1, yc, r.z1);
    const cut = cornerCut(r, c.face, faces, bays, c.bays);
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
  return top;
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
  for (let f = 0; f < floors; f++) {
    const y = y0 + f * fh, burnt = dmg.burnt.has(f);
    // the spandrel: one band per run of standing bays (a collapsed corner or a blown bay breaks it)
    let run0 = -1;
    const flush = (b: number) => {
      if (run0 < 0) return;
      const u0 = -W / 2 + run0 * bw, u1 = -W / 2 + b * bw;
      // (looks r2) the spandrel panel with its sill: a drip-nosed sill course along its head, 5 cm proud of the panel
      faceSection(sink, sp.bucket, face, u0, u1, [[0, y], [sp.out, y], [sp.out, y + sp.h - 0.14], [sp.out + 0.05, y + sp.h - 0.1],
        [sp.out + 0.05, y + sp.h], [0, y + sp.h]], { ...spOpts, ...(burnt ? { colour: CHAR, shade: 0.4 } : {}) });
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
      const y1 = Math.min(y + 2.2 * fh, y0 + floors * fh);
      if (pier) for (let k = 0; k <= bays; k++) soot(sink, pier.bucket, face, -W / 2 + k * bw, pier.w * 0.9, y + sp.h, y1, pier.out + 0.008, pier.colour);
      if (f + 1 < floors) soot(sink, sp.bucket, face, 0, W - 0.4, y + fh, y + fh + sp.h, sp.out + 0.008, sp.colour);
    }
  }
  // the piers, full height over the standing bays (a collapsed corner's piers stop at its floor)
  if (pier) {
    const pOpts: EmitOptions = { ...DECOR, fineSides: true, ...(pier.colour ? { colour: pier.colour } : {}), ...(pier.shade ? { shade: pier.shade } : {}) };
    for (let k = 0; k <= bays; k++) {
      const u = -W / 2 + k * bw;
      const corner0 = k === 0 || k === bays;
      const goneAbove = corner?.from && ((corner.from.end > 0 && k >= bays - corner.from.n) || (corner.from.end < 0 && k <= corner.from.n));
      const yTop = goneAbove ? y0 + corner!.floor * fh : y0 + floors * fh;
      if (yTop - y0 < 0.5) continue;
      const pw = corner0 ? pier.w * 1.2 : pier.w;
      // (looks r2) a deco pier of two orders: its back order the pier's width out to 55 % of its reach, the front order
      // stepped in 9 cm a side with its arrises chamfered (a box before)
      steppedPier(sink, pier.bucket, face, corner0 ? u - Math.sign(u) * pw / 2 : u, y0, yTop, pw, pier.out, pOpts);
    }
  }
}
