// src/world/maps/regional/shanghaiBund.ts — the Shanghai kit's landmarks (shanghai.ts), each in the footprint of the
// megacity landmark it replaces, so the district keeps its skyline:
//   - megatower, arcology, needletower → the Bund's Art Deco towers in the skyline kit's grammar (skyline.ts decoTower,
//     the facades lane): Sassoon House under its copper pyramid, Broadway Mansions and the Park Hotel under stepped
//     crowns; the Settlement's standing intact or shelled, Zhabei's at any damage;
//   - terracetower → the Bank of China (1937): golden granite, the tower over its wings, the Chinese lattice band and
//     the pyramid roof of green glazed tile;
//   - broadcasttower → the Customs House (1927): granite, the Doric columns in its recessed front, the clock tower
//     ("Big Ching") stepping up to its cap;
//   - civichall → in the Settlement the Bund's banks, three ways (the HSBC's dome on its drum; a portico of giant columns
//     in a recessed front under a pediment; a Renaissance block with copper-capped corner turrets); in Zhabei, Shanghai
//     North Station (skyline.ts stationHall), burnt out as in 1932 and 1937, its depth held to the plot's;
//   - parkingdeck → the Joint Trust warehouse ("Sihang", 1931): four storeys of concrete frame, the front's middle bay
//     rising over the flat roof with the warehouse's name, its windows sandbagged and shot out, the shell holes of
//     October 1937 in the wall that faced the attack; some of them brick-faced godowns of the same build.
// Collision: every landmark's structure is a few prisms (its podium, its tiers, its tower); the facades are dressing.
import { PartSink, faceBox, facePanel, facePoint, rgb, shade, type Face, type RegionalBucket, type RegionalParts, type Rgb } from './geometry.ts';
import { DAMP_EDGE_BREAKS, holedBox, holedPolygon, recordBody, type HoleRect } from './house.ts';
import { windowUnit } from './openings.ts';
import type { RegionalBuildContext, RegionalBuilder } from './types.ts';
import {
  BRONZE, BUND_WINDOW, CHAR, COPPER_GREEN, GILT, IRON, WHITE_TRIM, bankOf, choose, clampTo, fillOf, planFaces, pocks, pyramid, rect,
  sandbags, uvOffset,
} from './shanghaiParts.ts';
import { stationHall } from './skyline.ts';
import { decoTower } from './skylineDeco.ts'; // (looks r2 b-east, 2026-10-16: the Bund towers' own deco tower)
import { bankOfChina } from './shanghaiBank.ts'; // (looks r2 b-east, 2026-10-16: extracted, rebuilt there)

const DEC = { decor: true } as const;
const SHADOWED = { decor: true, shadow: true } as const;

/** A tower's facade: window columns between proud piers, per floor a pane over a spandrel panel. */
interface FacadeStyle {
  /** the window columns' pitch along the face and the piers' width */
  pitch: number;
  pier: number;
  pierBucket: RegionalBucket;
  pierOut: number;
  /** the piers' occlusion (a darker brick: the Park Hotel's brown) */
  pierShade?: number;
  /** the spandrel panel under each window (a coloured panel), or null (the wall shows) */
  spandrel: Rgb | null;
  /** shares of the windows lit at night and gone dark (shelled, shuttered, blacked out) */
  lit: number;
  dark: number;
}

/**
 * Dress one face from y0 to y1 in floors of fh with a facade style (dressing only): the piers proud, the spandrel beams
 * across each floor between the windows set back behind them, the glazing set back behind the beams (props census #9,
 * the standard's frame: "columns and spandrel beams proud, infill set back"; the panes and the spandrel panels were laid
 * flat on the face).
 */
function deco(sink: PartSink, face: Face, y0: number, y1: number, fh: number, st: FacadeStyle, look: () => number, inset = 0.35): void {
  const w = face.width - 2 * inset, floors = Math.floor((y1 - y0) / fh + 1e-6);
  if (w < 1 || floors < 1) return;
  const n = Math.max(1, Math.round(w / st.pitch)), pitch = w / n, gw = Math.max(0.3, pitch - st.pier);
  const beamOut = st.pierOut * 0.7, beam = st.spandrel ? { colour: st.spandrel } : st.pierShade ? { shade: st.pierShade } : {};
  const beamBucket = st.spandrel ? 'structureMetal' as const : st.pierBucket;
  for (let f = 0; f < floors; f++) {
    const y = y0 + f * fh;
    for (let k = 0; k < n; k++) {
      const u = -w / 2 + pitch * (k + 0.5), r = look();
      const bucket = r < st.dark ? 'dark' : r < st.dark + st.lit ? 'curtain' : 'glass';
      facePanel(sink, bucket, face, u, y + fh * 0.6, 0.012, gw, fh * 0.6, { decor: true, window: face.out });
    }
    // the floor's spandrel beam under its windows (over the ones below), the piers standing proud of it
    const b0 = Math.max(y0, y - fh * 0.1), b1 = y + fh * 0.3;
    faceBox(sink, beamBucket, face, 0, (b0 + b1) / 2, beamOut / 2, w, b1 - b0, beamOut, { decor: true, ...beam });
  }
  // the head beam over the top floor's windows
  const top = y0 + floors * fh;
  faceBox(sink, beamBucket, face, 0, top - fh * 0.05, beamOut / 2, w, fh * 0.1, beamOut, { decor: true, ...beam });
  const span = floors * fh, opts = { decor: true, fineSides: true, ...(st.pierShade ? { shade: st.pierShade } : {}) };
  for (let k = 0; k <= n; k++) faceBox(sink, st.pierBucket, face, -w / 2 + pitch * k, y0 + span / 2, st.pierOut / 2, st.pier, span, st.pierOut, opts);
}

/** The faces of a tier x0..x1, z0..z1 (front +z, right, back, left). */
const tierFaces = (x0: number, x1: number, z0: number, z1: number): Face[] => planFaces(rect(x0, z0, x1, z1));

/**
 * A face's war: shell pocks over its lower storeys, a breach, sandbags along its foot (dressing: a phone draws it as the
 * desktop does and keeps none of it, PartSink.dressing).
 */
function scars(sink: PartSink, face: Face, h: number, look: () => number, mobile: boolean, heavy = false,
  keep: ReadonlyArray<{ u0: number; u1: number; y0: number; y1: number }> = []): void {
  sink.dressing(mobile, () => {
    pocks(sink, face, -face.width / 2 + 0.4, face.width / 2 - 0.4, 0.4, Math.min(h, 12), (heavy ? 24 : 6) + Math.floor(look() * 10), look, keep);
    // (props census #9: a heavy face's breaches are cut into its wall by its builder; the draws are kept)
    if (heavy && look() < 0.6) { look(); look(); look(); }
  });
}

// ------------------------------------------------------------------------------------------------ the Bund's towers

/**
 * A Bund tower in the skyline kit's deco grammar (skyline.ts decoTower: the granite podium, the shaft of piers over
 * recessed spandrels in setbacks, the crown): the Settlement's stand intact or shelled, Zhabei's take any damage.
 */
function bundTower(crown: 'pyramid' | 'stepped' | 'needle'): RegionalBuilder {
  const standing = [decoTower({ crown, damage: 0 }), decoTower({ crown, damage: 1 })], any = decoTower({ crown });
  return (ctx) => {
    // the deco tower fits the plan's plot; where the base measured wider (the megatower's 25.4 m against its 24.7 m
    // plot) it fits that reach, so the body stands within half a metre of the base's on every side
    const b = ctx.bounds;
    const fitted = { ...ctx, info: { ...ctx.info, w: Math.max(ctx.info.w, b.maxX - b.minX), d: Math.max(ctx.info.d, b.maxZ - b.minZ) } };
    return bankOf(ctx) === 'zhabei' ? any(fitted) : standing[ctx.variant() < 0.6 ? 0 : 1](fitted);
  };
}

/**
 * A builder held to its plot's depth: a building whose own grammar wants more depth than the plot has (the skyline
 * kit's terminus wants 26 m, the civic halls' plots are 22.8 m) is built at its depth and drawn in toward its street
 * front's centre line until its solid parts stand within the base's reach, so its head building keeps the street and
 * its train shed runs back toward the tracks behind it.
 */
function heldToDepth(builder: RegionalBuilder): RegionalBuilder {
  return (ctx) => {
    const parts = builder(ctx);
    const b = ctx.bounds, all = Object.values(parts).flat();
    let z0 = Infinity, z1 = -Infinity;
    for (const g of all) {
      if (g.userData.noCollision) continue;
      g.computeBoundingBox();
      z0 = Math.min(z0, g.boundingBox!.min.z); z1 = Math.max(z1, g.boundingBox!.max.z);
    }
    const room = b.maxZ - b.minZ - 0.8, cz = (b.minZ + b.maxZ) / 2;
    if (z1 - z0 > room && z1 > z0) {
      const k = room / (z1 - z0);
      for (const g of all) { g.translate(0, 0, -cz); g.scale(1, 1, k); g.translate(0, 0, cz); g.boundingBox = null; }
    }
    return parts;
  };
}

/** Shanghai North Station in Zhabei: the skyline kit's terminus, its head building to the street, burnt out, its name
 *  board over the arch (its forecourt and tracks: shanghaiStreets.ts dressNorthStation). */
const northStation = heldToDepth(stationHall({ damage: 2, nameBoard: true }));

// ------------------------------------------------------------------------------------------------ the Bank of China


// ------------------------------------------------------------------------------------------------ the Customs House

/** The Customs House: granite, the Doric columns in the recessed front, the clock tower stepping up to its cap. */
const customsHouse: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const f = fillOf(ctx.bounds, 0.1);
  sink.placed(0, f.cx, 0, f.cz, () => {
    const look = ctx.variant, mobile = ctx.tier === 'mobile';
    const W = clampTo(f.w, 5, 60), D = clampTo(f.d, 5, 60), H = clampTo(ctx.info.h, 8, 90);
    const fh = 3.6, blockTop = Math.max(fh * 2, H * 0.47);
    const granite: FacadeStyle = { pitch: 2.0, pier: 0.65, pierBucket: 'plaster3', pierOut: 0.2, spandrel: rgb(0x8c867b), lit: 0.05, dark: 0.06 }; // (wave 149: a lit window reads a flat white pane by day; few were lit in the shelled city)
    // the block with its front's middle recessed behind the columns
    const rec = Math.min(2.2, D * 0.12), pw = Math.min(W * 0.42, 11);
    // (props census #9) the recess's ground-storey glazing cut through the block's front, the glass at the back of the cut
    // (it was laid on the block)
    const grev = 0.34;
    holedBox(sink, 'plaster3', -W / 2, -D / 2, W / 2, D / 2 - rec, -0.4, blockTop, { front: [{ u0: -(pw - 1.2) / 2, u1: (pw - 1.2) / 2, y0: 0.8, y1: 6.0 }] }, 0.4, grev);
    sink.span('plaster3', -W / 2, -0.4, D / 2 - rec, -pw / 2, blockTop, D / 2);
    sink.span('plaster3', pw / 2, -0.4, D / 2 - rec, W / 2, blockTop, D / 2);
    sink.span('plaster3', -W / 2 - 0.12, blockTop - 0.55, -D / 2 - 0.12, W / 2 + 0.12, blockTop, D / 2 + 0.12, SHADOWED);
    const faces = tierFaces(-W / 2, W / 2, -D / 2, D / 2);
    for (const face of faces.slice(1)) deco(sink, face, 4.8, blockTop - 0.7, fh, granite, look, 0.5);
    // the front's wings and its recess
    for (const side of [-1, 1]) {
      const wf: Face = { origin: [side * (W / 2 + pw / 2) / 2, 0, D / 2], u: [1, 0, 0], out: [0, 0, 1], width: W / 2 - pw / 2 };
      deco(sink, wf, 4.8, blockTop - 0.7, fh, granite, look, 0.4);
    }
    const recess: Face = { origin: [0, 0, D / 2 - rec], u: [1, 0, 0], out: [0, 0, 1], width: pw };
    deco(sink, recess, 10.6, blockTop - 0.7, fh, granite, look, 0.3);
    facePanel(sink, 'glass', recess, 0, 3.4, -grev + 0.02, pw - 1.2, 5.2, { decor: true, window: recess.out });
    const cols = 4;
    for (let k = 0; k < cols; k++) {
      const x = -pw / 2 + 0.9 + k * (pw - 1.8) / (cols - 1);
      sink.cylinder('plaster3', [x, 0, D / 2 - 0.55], 'y', 9.6, 0.5, 10, SHADOWED, 0.44);
    }
    sink.span('plaster3', -pw / 2, 9.6, D / 2 - rec, pw / 2, 11.0, D / 2 + 0.05, SHADOWED);
    // the clock tower: the shaft, the clock stage, two steps and the cap
    const tx = Math.min(W * 0.2, 5.5), tz = Math.min(D * 0.24, tx), tzc = D / 2 - rec - tz - 0.4;
    const shaftTop = Math.max(blockTop + 6, H * 0.77), clockY = shaftTop - 2.8;
    sink.span('plaster3', -tx, blockTop, tzc - tz, tx, shaftTop, tzc + tz);
    // (E13) the block and the clock tower (a shaft, in bands) as bodies for the damage reading
    recordBody(sink, 0, 0, W, D, blockTop, 'plaster3', false, true);
    recordBody(sink, 0, tzc, 2 * tx, 2 * tz, H, 'plaster3', true, true);
    for (const face of tierFaces(-tx, tx, tzc - tz, tzc + tz)) {
      deco(sink, face, blockTop + 0.4, clockY - 2.0, fh, granite, look, 0.4);
      faceBox(sink, 'structureMetal', face, 0, clockY, 0.04, Math.min(face.width * 0.62, 4), Math.min(face.width * 0.62, 4), 0.06, { colour: WHITE_TRIM, decor: true });
      // (the hands 5 cm wide: at 8 cm they read as dark plates on the dial)
      faceBox(sink, 'structureMetal', face, 0, clockY + 0.45, 0.09, 0.05, 0.95, 0.03, { colour: IRON, decor: true, fine: true });
      faceBox(sink, 'structureMetal', face, 0.3, clockY, 0.09, 0.62, 0.05, 0.03, { colour: IRON, decor: true, fine: true });
    }
    const step1 = shaftTop + Math.max(1, (H - shaftTop) * 0.35), step2 = step1 + Math.max(1, (H - shaftTop) * 0.25);
    sink.span('plaster3', -tx * 0.8, shaftTop, tzc - tz * 0.8, tx * 0.8, step1, tzc + tz * 0.8);
    sink.span('plaster3', -tx * 0.55, step1, tzc - tz * 0.55, tx * 0.55, step2, tzc + tz * 0.55);
    pyramid(sink, 'structureMetal', 0, tzc, tx * 0.5, tz * 0.5, step2, Math.max(step2 + 1.5, H), { colour: rgb(0x4a4f4c) });
    scars(sink, faces[1], 5, look, mobile);
  });
  return sink.finish();
};

// ------------------------------------------------------------------------------------------------ the Bund's banks

/** One of the Bund's banks: the rusticated granite block and its cornice, with a dome, a portico or corner turrets. */
const bundBank: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const f = fillOf(ctx.bounds, 0.1);
  sink.placed(0, f.cx, 0, f.cz, () => {
    const rng = ctx.rng, look = ctx.variant, mobile = ctx.tier === 'mobile';
    const W = clampTo(f.w, 5, 60), D = clampTo(f.d, 5, 60);
    const kind = choose(rng(), ['dome', 'portico', 'turret'] as const);
    const ground = 5.0, sh = 4.0, top = ground + 2 * sh, rec = kind === 'portico' ? Math.min(1.6, D * 0.1) : 0, pw = Math.min(W * 0.5, 14);
    // (props census #9) the block, its portico's wings and its turrets built as walls with their windows and doors cut
    // through them, the units in the reveals (the windows, the doors and the recess's glazing were laid on solid spans)
    const rev = 0.3, faces = tierFaces(-W / 2, W / 2, -D / 2, D / 2);
    const holes: HoleRect[][] = faces.map(() => []);
    const units: Array<() => void> = [];
    const keystones: Array<[Face, number]> = [];
    const doorW = 2.4;
    faces.forEach((face, fi) => {
      // the rusticated ground storey's arched windows, the piano nobile's tall windows over them
      const n = Math.max(1, Math.round((face.width - 1.2) / 3.0)), pitch = (face.width - 1.2) / n;
      for (let k = 0; k < n; k++) {
        const u = -face.width / 2 + 0.6 + pitch * (k + 0.5);
        if (fi === 0 && rec > 0 && Math.abs(u) < pw / 2 + 0.2) continue;
        const pane = look() < 0.2 ? 'curtain' as const : 'glass' as const;
        // (the bank's doors take the front's middle bay's ground storey)
        if (!(fi === 0 && rec === 0 && Math.abs(u) < doorW / 2 + 0.85)) {
          holes[fi].push({ u0: u - 0.75, u1: u + 0.75, y0: 0.9, y1: 3.7 });
          units.push(() => facePanel(sink, pane, face, u, 2.3, -rev + 0.016, 1.5, 2.8, { decor: true, window: face.out }));
          keystones.push([face, u]);
        }
        for (let st = 0; st < 2; st++) {
          const y = ground + st * sh + 0.7, h = st === 0 ? 2.5 : 2.0;
          holes[fi].push({ u0: u - 0.65, u1: u + 0.65, y0: y, y1: y + h });
          units.push(() => windowUnit(sink, face, u, y, 1.3, h, BUND_WINDOW, look, 0.25));
        }
      }
    });
    const front = faces[0];
    if (rec === 0) holes[0].push({ u0: -doorW / 2, u1: doorW / 2, y0: 0.2, y1: 3.8 });
    // the block: its front the recess's back where the portico stands (its windows outside the recess are the wings')
    const recHoles: HoleRect[] = [];
    if (rec > 0) {
      recHoles.push({ u0: -(pw - 1.6) / 2, u1: (pw - 1.6) / 2, y0: 0.8, y1: 4.4 });
      for (let st = 0; st < 2; st++) for (let k = 0; k < 5; k++) recHoles.push({ u0: -pw / 2 + 1.4 + k * (pw - 2.8) / 4 - 0.55, u1: -pw / 2 + 1.4 + k * (pw - 2.8) / 4 + 0.55, y0: ground + st * sh + 0.7, y1: ground + st * sh + 2.9 });
    }
    holedBox(sink, 'plaster3', -W / 2, -D / 2, W / 2, D / 2 - rec, -0.4, top, { front: rec > 0 ? recHoles : holes[0], right: holes[1], back: holes[2], left: holes[3] }, 0.4, rev);
    if (rec > 0) {
      // the portico's wings: their fronts holed, their cores back to the block
      for (const side of [-1, 1]) {
        const x0 = side < 0 ? -W / 2 : pw / 2, x1 = side < 0 ? -pw / 2 : W / 2, cx = (x0 + x1) / 2, ww = x1 - x0;
        const wf: Face = { origin: [cx, 0, D / 2], u: [1, 0, 0], out: [0, 0, 1], width: ww };
        sink.span('plaster3', x0, -0.4, D / 2 - rec, x1, top, D / 2 - 0.4);
        holedPolygon(sink, 'plaster3', wf, [[-ww / 2, -0.4], [ww / 2, -0.4], [ww / 2, top], [-ww / 2, top]],
          holes[0].filter((h) => (h.u0 + h.u1) / 2 * side > 0).map((h) => ({ ...h, u0: h.u0 - cx, u1: h.u1 - cx })), 0.4, rev, {}, [], DAMP_EDGE_BREAKS);
      }
      // the portico's floor over the recess's ground storey, the columns standing on it
      sink.span('plaster3', -pw / 2, ground - 0.3, D / 2 - rec, pw / 2, ground, D / 2);
    }
    sink.recess = rev;
    try { for (const unit of units) unit(); } finally { sink.recess = 0; }
    for (const [face, u] of keystones) faceBox(sink, 'plaster3', face, u, 3.92, 0.07, 0.5, 0.42, 0.14, { decor: true, fineSides: true });
    // the cornice and the attic over it
    sink.span('plaster3', -W / 2 - 0.15, top - 0.5, -D / 2 - 0.15, W / 2 + 0.15, top, D / 2 + 0.15, SHADOWED);
    sink.span('plaster3', -W / 2 + 0.3, top, -D / 2 + 0.3, W / 2 - 0.3, top + 1.1, D / 2 - 0.3);
    // (E13) the bank in its storey bands for the damage reading
    recordBody(sink, 0, 0, W, D, top + 1.1, 'plaster3', false, true);
    faces.forEach((face, fi) => {
      // the rustication's joints, broken at the openings (and at the portico's mouth); the ground storey's cornice
      const gaps = [...(fi === 0 && rec > 0 ? [[-pw / 2, pw / 2]] : []), ...holes[fi].map((h): [number, number] => [h.u0, h.u1])].sort((p, q) => p[0] - q[0]);
      if (!mobile) for (const y of [1.25, 2.5, 3.75]) {
        let cur = -face.width / 2 + 0.1;
        const runs: Array<[number, number]> = [];
        for (const [g0, g1] of gaps) {
          const hit = fi === 0 && rec > 0 && g0 === -pw / 2 ? true : holes[fi].some((h) => h.u0 === g0 && h.y0 < y + 0.03 && h.y1 > y - 0.03);
          if (!hit) continue;
          if (g0 - 0.02 > cur) runs.push([cur, g0 - 0.02]);
          cur = Math.max(cur, g1 + 0.02);
        }
        if (face.width / 2 - 0.1 > cur) runs.push([cur, face.width / 2 - 0.1]);
        // (a joint's 1 cm lids along a 30 m run were slivers: the front and its ends only)
        for (const [r0, r1] of runs) if (r1 - r0 > 0.1) faceBox(sink, 'dark', face, (r0 + r1) / 2, y, 0.005, r1 - r0, 0.05, 0.01, { decor: true, fine: true }, 'caps');
      }
      faceBox(sink, 'plaster3', face, 0, ground, 0.08, face.width, 0.28, 0.16, { decor: true, fineSides: true });
    });
    if (kind === 'portico') {
      const cols = 6;
      for (let k = 0; k < cols; k++) {
        const x = -pw / 2 + 0.8 + k * (pw - 1.6) / (cols - 1);
        sink.cylinder('plaster3', [x, ground, D / 2 - 0.6], 'y', top - ground - 0.5, 0.48, 10, SHADOWED, 0.42);
      }
      // the pediment over the columns, from 1.4 m back to the front's plane (counter-clockwise seen from the street)
      sink.prism('plaster3', [facePoint(front, -pw / 2, top, -1.4), facePoint(front, pw / 2, top, -1.4), facePoint(front, 0, top + 2.4, -1.4)], front.out, 1.4, SHADOWED);
      const recess: Face = { origin: [0, 0, D / 2 - rec], u: [1, 0, 0], out: [0, 0, 1], width: pw };
      facePanel(sink, 'glass', recess, 0, 2.6, -rev + 0.016, pw - 1.6, 3.6, { decor: true, window: recess.out });
      sink.recess = rev;
      try {
        for (let st = 0; st < 2; st++) for (let k = 0; k < 5; k++) windowUnit(sink, recess, -pw / 2 + 1.4 + k * (pw - 2.8) / 4, ground + st * sh + 0.7, 1.1, 2.2, BUND_WINDOW, look, 0.25);
      } finally { sink.recess = 0; }
    } else if (kind === 'dome') {
      // the drum and its windows (each set back in its surround, proud of the drum: they were panes laid on it), the
      // dome in three courses, the lantern
      const r = Math.min(W, D) * 0.19, y0 = top + 1.1;
      sink.cylinder('plaster3', [0, y0, 0], 'y', 3.2, r, 16, SHADOWED);
      const drum = (a: number): Face => ({ origin: [Math.sin(a) * r, 0, Math.cos(a) * r], u: [Math.cos(a), 0, -Math.sin(a)], out: [Math.sin(a), 0, Math.cos(a)], width: 1 });
      for (let k = 0; k < 8; k++) {
        const df = drum((k / 8) * Math.PI * 2 + Math.PI / 8);
        facePanel(sink, 'glass', df, 0, y0 + 1.6, 0.02, 0.8, 1.8, DEC);
        for (const s2 of [-1, 1]) faceBox(sink, 'plaster3', df, s2 * 0.49, y0 + 1.6, 0.09, 0.18, 2.16, 0.18, { decor: true, fineSides: true });
        for (const s2 of [-1, 1]) faceBox(sink, 'plaster3', df, 0, y0 + 1.6 + s2 * 0.99, 0.09, 0.8, 0.18, 0.18, { decor: true }, 'ends');
      }
      const copper = { colour: COPPER_GREEN, ...SHADOWED };
      sink.cylinder('structureMetal', [0, y0 + 3.2, 0], 'y', r * 0.38, r * 1.04, 16, copper, r * 0.9);
      sink.cylinder('structureMetal', [0, y0 + 3.2 + r * 0.38, 0], 'y', r * 0.34, r * 0.9, 16, copper, r * 0.62);
      sink.cylinder('structureMetal', [0, y0 + 3.2 + r * 0.72, 0], 'y', r * 0.28, r * 0.62, 16, copper, r * 0.2);
      sink.cylinder('plaster3', [0, y0 + 3.2 + r, 0], 'y', 1.6, Math.max(0.35, r * 0.16), 8, SHADOWED);
      sink.cylinder('structureMetal', [0, y0 + 4.8 + r, 0], 'y', 0.9, Math.max(0.4, r * 0.18), 8, copper, 0.05);
    } else {
      // the corner turrets on the front, their windows cut through their walls, their copper caps
      const tw = Math.min(4.2, W * 0.16, D * 0.22);
      for (const side of [-1, 1]) {
        const x0 = side < 0 ? -W / 2 : W / 2 - tw, z0 = D / 2 - tw;
        const th: HoleRect[] = [{ u0: -0.5, u1: 0.5, y0: top + 1.6, y1: top + 3.4 }];
        holedBox(sink, 'plaster3', x0, z0, x0 + tw, D / 2, top, top + 4.4, { front: th, right: th, back: th, left: th }, 0.3, 0.24);
        sink.recess = 0.24;
        try { for (const face of tierFaces(x0, x0 + tw, z0, D / 2)) windowUnit(sink, face, 0, top + 1.6, 1.0, 1.8, BUND_WINDOW, look, 0.2); } finally { sink.recess = 0; }
        pyramid(sink, 'structureMetal', x0 + tw / 2, z0 + tw / 2, tw / 2 + 0.2, tw / 2 + 0.2, top + 4.4, top + 7.8, { colour: COPPER_GREEN, ...SHADOWED });
      }
    }
    // the bank's doors (bronze, at the back of their opening) and its name over them, sandbags along the front
    if (kind !== 'portico') {
      faceBox(sink, 'structureMetal', front, 0, 2.0, -rev + 0.03, doorW, 3.6, 0.04, { colour: shade(BRONZE, 0.7), decor: true });
      faceBox(sink, 'structureMetal', front, 0, 4.25, 0.1, 4.2, 0.45, 0.04, { colour: BRONZE, decor: true });
      faceBox(sink, 'structureMetal', front, 0, 4.25, 0.13, 3.2, 0.2, 0.01, { colour: GILT, decor: true, fine: true });
    }
    if (look() < 0.6) sandbags(sink, front, 0, 0, Math.min(W * 0.4, 8), 1.4, look);
    scars(sink, front, ground, look, mobile, false, [...holes[0], ...(rec > 0 ? [{ u0: -pw / 2, u1: pw / 2, y0: -1, y1: top }] : [])]);
  });
  return sink.finish();
};

// ------------------------------------------------------------------------------------------------ the Joint Trust warehouse

/**
 * The Joint Trust ("Sihang") warehouse: four storeys of concrete frame, the front's middle bay rising over the flat roof
 * with the name, the windows sandbagged and shot out, the shell holes in the wall that faced the attack; or a godown of
 * the same build faced in brick.
 */
const sihangWarehouse: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const f = fillOf(ctx.bounds, 0.1);
  sink.placed(0, f.cx, 0, f.cz, () => {
    const rng = ctx.rng, look = ctx.variant, mobile = ctx.tier === 'mobile';
    const W = clampTo(f.w, 5, 60), D = clampTo(f.d, 5, 60), H = clampTo(ctx.info.h, 6, 30);
    const brick = rng() < 0.4, wall: RegionalBucket = brick ? 'stone' : 'plaster3';
    const floors = Math.max(2, Math.round((H - 0.8) / 3.3)), fh = (H - 0.8) / floors, roofY = floors * fh;
    // (props census #9) the warehouse built as walls round a core with its windows, its breaches and its loading doors
    // cut through them (they were dark plates and panes laid on a solid span, the breaches dark stars, the soot a plate):
    // the panes at the back of the reveals, the sandbags packed in the openings, the soot the attacked wall's own stain
    const rev = 0.29;
    sink.span(wall, -W / 2, roofY, -D / 2, W / 2, roofY + 0.9, -D / 2 + 0.25, SHADOWED);
    sink.span(wall, -W / 2, roofY, D / 2 - 0.25, W / 2, roofY + 0.9, D / 2, SHADOWED);
    sink.span(wall, -W / 2, roofY, -D / 2 + 0.25, -W / 2 + 0.25, roofY + 0.9, D / 2 - 0.25, SHADOWED);
    sink.span(wall, W / 2 - 0.25, roofY, -D / 2 + 0.25, W / 2, roofY + 0.9, D / 2 - 0.25, SHADOWED);
    const tower = !brick && look() < 0.7, bw = Math.min(W * 0.22, 6.5);
    if (tower) {
      sink.span(wall, -bw / 2, roofY, D / 2 - 4.2, bw / 2, roofY + 3.6, D / 2);
      const tf: Face = { origin: [0, 0, D / 2], u: [1, 0, 0], out: [0, 0, 1], width: bw };
      // (the name board 12 cm deep: a board laid on the wall read as a dark plate)
      faceBox(sink, 'structureMetal', tf, 0, roofY + 2.2, 0.06, bw - 1.0, 0.9, 0.12, { colour: rgb(0x3a3733), decor: true });
      faceBox(sink, 'structureMetal', tf, 0, roofY + 2.2, 0.125, bw - 1.6, 0.42, 0.01, { colour: WHITE_TRIM, decor: true, fine: true });
    }
    // which face took the attack: the one looking most nearly toward -x of the world (a look choice from the pose)
    const yaw = ctx.yaw ?? Math.PI / 2;
    const faces = tierFaces(-W / 2, W / 2, -D / 2, D / 2);
    let attacked = 0, best = Infinity;
    faces.forEach((face, i) => {
      const wx = face.out[0] * Math.cos(yaw) + face.out[2] * Math.sin(yaw);
      if (wx < best) { best = wx; attacked = i; }
    });
    const frame = rgb(brick ? 0x5d3a2e : 0x8f8b84);
    const front = faces[0], docks = [-1, 1].map((side) => side * W * 0.3);
    const holes: HoleRect[][] = faces.map(() => []), units: Array<() => void> = [];
    const sunk = (face: Face): Face => ({ ...face, origin: [face.origin[0] - face.out[0] * (rev - 0.02), 0, face.origin[2] - face.out[2] * (rev - 0.02)] });
    faces.forEach((face, fi) => {
      const hit = fi === attacked;
      const n = Math.max(1, Math.round((face.width - 0.8) / 3.0)), pitch = (face.width - 0.8) / n;
      for (let f2 = 0; f2 < floors; f2++) {
        const y = f2 * fh;
        for (let k = 0; k < n; k++) {
          const u = -face.width / 2 + 0.4 + pitch * (k + 0.5), r = look();
          const gw = pitch - 1.0, gh = fh * 0.5, y0 = y + fh * 0.3;
          if (fi === 0 && tower && Math.abs(u) < bw / 2) continue;
          // (the loading doors take the front's ground storey where they stand)
          if (fi === 0 && f2 === 0 && docks.some((du) => Math.abs(u - du) < 1.5 + gw / 2 + 0.2)) continue;
          const shot = r < (hit ? 0.55 : 0.2), bags = shot && look() < 0.5;
          // a shell's breach: the opening blown wider, its rubble at the wall's foot
          const breached = hit && look() < 0.35;
          holes[fi].push(breached ? { u0: u - gw / 2 - 0.2, u1: u + gw / 2 + 0.2, y0: y0 - 0.3, y1: y0 + gh + 0.3 } : { u0: u - gw / 2, u1: u + gw / 2, y0, y1: y0 + gh });
          if (breached) {
            sink.dressing(mobile, () => {
              for (let j = 0; j < 3; j++) {
                const sz = 0.18 + look() * 0.22;
                faceBox(sink, 'stone', face, u + (look() - 0.5) * gw, sz / 2, 0.3 + look() * 0.8, sz * 1.4, sz, sz * 1.2, { decor: true });
              }
            });
          } else if (bags) units.push(() => sandbags(sink, sunk(face), u, y0, gw, gh * 0.6, look));
          else if (!shot) units.push(() => facePanel(sink, r < 0.85 ? 'glass' : 'curtain', face, u, y0 + gh / 2, -rev + 0.016, gw, gh, { decor: true, window: face.out }));
        }
      }
    });
    for (const du of docks) holes[0].push({ u0: du - 1.5, u1: du + 1.5, y0: 0, y1: 3.0 });
    const names = ['front', 'right', 'back', 'left'] as const;
    const fa = faces[attacked];
    holedBox(sink, wall, -W / 2, -D / 2, W / 2, D / 2, -0.4, roofY, { front: holes[0], right: holes[1], back: holes[2], left: holes[3] }, 0.35, rev, {},
      // (the stain splits the wall's pieces: a phone's wall is the desktop's, so it carries it too)
      { stains: { [names[attacked]]: [{ u0: -fa.width * 0.3, u1: fa.width * 0.1, y0: roofY * 0.5, y1: roofY, bottom: 1, top: 0.4 }] } });
    for (const unit of units) unit();
    // (E13) the warehouse in its storey bands for the damage reading
    recordBody(sink, 0, 0, W, D, roofY + 0.9, wall, false, true);
    faces.forEach((face, fi) => {
      const n = Math.max(1, Math.round((face.width - 0.8) / 3.0)), pitch = (face.width - 0.8) / n;
      // the floors' slab edges across the face, the frame's posts
      for (let f2 = 0; f2 < floors; f2++) faceBox(sink, wall, face, 0, f2 * fh + fh - 0.12, 0.08, face.width, 0.3, 0.16, { decor: true, fineSides: true });
      for (let k = 0; k <= n; k++) faceBox(sink, 'structureMetal', face, -face.width / 2 + 0.4 + pitch * k, roofY / 2, 0.1, 0.5, roofY, 0.2, { colour: frame, decor: true, fineSides: true });
      if (fi === attacked) scars(sink, face, roofY, look, mobile, true, holes[fi]);
    });
    // the loading bays on the street front: their doorways open, the docks in front (clear of the wall: their backs
    // close them over the doorways)
    for (const du of docks) faceBox(sink, 'structureWood', front, du, 0.5, 0.605, 3.6, 1.0, 1.2, { colour: rgb(0x4a4038), decor: true });
    if (look() < 0.5) faceBox(sink, 'structureMetal', front, 0, 0.6, 0.6, Math.min(W * 0.3, 7), 1.2, 1.1, { colour: CHAR, decor: true });
  });
  return sink.finish();
};

export const SHANGHAI_BUND_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  megatower: bundTower('pyramid'),
  arcology: bundTower('stepped'),
  needletower: bundTower('stepped'),
  terracetower: bankOfChina,
  broadcasttower: customsHouse,
  civichall: (ctx: RegionalBuildContext) => (bankOf(ctx) === 'zhabei' ? northStation(ctx) : bundBank(ctx)),
  parkingdeck: sihangWarehouse,
});

export type { RegionalBuildContext, RegionalParts, shade };
