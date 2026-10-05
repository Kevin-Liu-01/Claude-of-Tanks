// src/world/maps/regional/shanghaiBund.ts — the Shanghai kit's landmarks (shanghai.ts), each in the footprint of the
// megacity landmark it replaces, so the district keeps its skyline:
//   - arcology → Broadway Mansions (1934): brown brick in tiers stepping back to its crown over a granite podium, the
//     window columns between its piers;
//   - needletower → the Park Hotel (1934): the dark brown shaft on its black granite base, piers running up to the
//     stepped crown;
//   - megatower → Sassoon House (1929): granite with bronze spandrels, its front tower under the green copper pyramid;
//   - terracetower → the Bank of China (1937): golden granite, the tower over its wings, the Chinese lattice band and
//     the pyramid roof of green glazed tile;
//   - broadcasttower → the Customs House (1927): granite, the Doric columns in its recessed front, the clock tower
//     ("Big Ching") stepping up to its cap;
//   - civichall → the Bund's banks, three ways: the HSBC's dome on its drum; a portico of giant columns in a recessed
//     front under a pediment; a Renaissance block with copper-capped corner turrets;
//   - parkingdeck → the Joint Trust warehouse ("Sihang", 1931): four storeys of concrete frame, the front's middle bay
//     rising over the flat roof with the warehouse's name, its windows sandbagged and shot out, the shell holes of
//     October 1937 in the wall that faced the attack; some of them brick-faced godowns of the same build.
// Collision: every landmark's structure is a few prisms (its podium, its tiers, its tower); the facades are dressing.
import { PartSink, faceBox, facePanel, facePoint, rgb, shade, type Face, type RegionalBucket, type RegionalParts, type Rgb } from './geometry.ts';
import { emitRoof, roofGeometry, type RoofSpec } from './house.ts';
import { windowUnit } from './openings.ts';
import type { RegionalBuildContext, RegionalBuilder } from './types.ts';
import {
  BRONZE, BUND_WINDOW, CHAR, COPPER_GREEN, GILT, IRON, WHITE_TRIM, breach, choose, clampTo, fillOf, planFaces, pocks, pyramid, rect, sandbags,
  soot, uvOffset,
} from './shanghaiParts.ts';

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

/** Dress one face from y0 to y1 in floors of fh with a facade style (dressing only). */
function deco(sink: PartSink, face: Face, y0: number, y1: number, fh: number, st: FacadeStyle, look: () => number, inset = 0.35): void {
  const w = face.width - 2 * inset, floors = Math.floor((y1 - y0) / fh + 1e-6);
  if (w < 1 || floors < 1) return;
  const n = Math.max(1, Math.round(w / st.pitch)), pitch = w / n, gw = Math.max(0.3, pitch - st.pier);
  for (let f = 0; f < floors; f++) {
    const y = y0 + f * fh;
    for (let k = 0; k < n; k++) {
      const u = -w / 2 + pitch * (k + 0.5), r = look();
      const bucket = r < st.dark ? 'dark' : r < st.dark + st.lit ? 'curtain' : 'glass';
      facePanel(sink, bucket, face, u, y + fh * 0.6, 0.012, gw, fh * 0.6, { decor: true, window: face.out });
      if (st.spandrel) facePanel(sink, 'structureMetal', face, u, y + fh * 0.15, 0.014, gw, fh * 0.26, { decor: true, colour: st.spandrel });
    }
  }
  const span = floors * fh, opts = { decor: true, fineSides: true, ...(st.pierShade ? { shade: st.pierShade } : {}) };
  for (let k = 0; k <= n; k++) faceBox(sink, st.pierBucket, face, -w / 2 + pitch * k, y0 + span / 2, st.pierOut / 2, st.pier, span, st.pierOut, opts);
}

/** The faces of a tier x0..x1, z0..z1 (front +z, right, back, left). */
const tierFaces = (x0: number, x1: number, z0: number, z1: number): Face[] => planFaces(rect(x0, z0, x1, z1));

/** A flagpole on a roof (dressing): the pole and, now and then, the flag. */
function flagpole(sink: PartSink, x: number, y: number, z: number, h: number, look: () => number): void {
  sink.cylinder('structureMetal', [x, y, z], 'y', h, 0.05, 5, { colour: IRON, decor: true, fine: true });
  if (look() < 0.5) {
    const flag: Face = { origin: [x, 0, z], u: [1, 0, 0], out: [0, 0, 1], width: 1 };
    faceBox(sink, 'structureWood', flag, 0.75, y + h - 0.55, 0, 1.4, 0.9, 0.02, { colour: choose(look(), [rgb(0x8c2b22), rgb(0x2f3f6a), rgb(0x6a6a5c)]), decor: true, fine: true });
  }
}

/** The ground storey's shopfronts and doors along a podium face (dressing). */
function podiumFront(sink: PartSink, face: Face, h: number, look: () => number, pierBucket: RegionalBucket, pierShade = 1): void {
  const w = face.width - 0.8, n = Math.max(1, Math.round(w / 3.2)), pitch = w / n;
  for (let k = 0; k < n; k++) {
    const u = -w / 2 + pitch * (k + 0.5), gh = Math.min(h - 1.0, 3.6);
    facePanel(sink, look() < 0.25 ? 'curtain' : 'glass', face, u, 0.3 + gh / 2, 0.012, pitch - 0.9, gh, { decor: true, window: face.out });
    faceBox(sink, 'structureMetal', face, u, 0.3 + gh + 0.2, 0.05, pitch - 0.7, 0.3, 0.08, { colour: BRONZE, decor: true, fine: true });
  }
  for (let k = 0; k <= n; k++) faceBox(sink, pierBucket, face, -w / 2 + pitch * k, h / 2, 0.08, 0.7, h, 0.16, { decor: true, fineSides: true, shade: pierShade });
}

/** A face's war: shell pocks over its lower storeys, a breach, sandbags along its foot (dressing; phones skip it). */
function scars(sink: PartSink, face: Face, h: number, look: () => number, mobile: boolean, heavy = false): void {
  if (mobile) return;
  pocks(sink, face, -face.width / 2 + 0.4, face.width / 2 - 0.4, 0.4, Math.min(h, 12), (heavy ? 24 : 6) + Math.floor(look() * 10), look);
  if (heavy && look() < 0.6) breach(sink, face, (look() - 0.5) * face.width * 0.6, 4 + look() * Math.max(1, h - 6), 0.8 + look() * 0.6, look);
}

// ------------------------------------------------------------------------------------------------ Broadway Mansions

/** Broadway Mansions: the granite podium, the brown brick tiers stepping back to the crown, the flagpole. */
const broadwayMansions: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const f = fillOf(ctx.bounds, 0.1);
  sink.placed(0, f.cx, 0, f.cz, () => {
    const look = ctx.variant, mobile = ctx.tier === 'mobile';
    const W = clampTo(f.w, 5, 60), D = clampTo(f.d, 5, 60), H = clampTo(ctx.info.h, 8, 80);
    const podH = Math.min(7, H * 0.2), fh = 3.2;
    const brick: FacadeStyle = { pitch: 1.7, pier: 0.5, pierBucket: 'stone', pierOut: 0.18, pierShade: 0.8, spandrel: rgb(0x55392b), lit: 0.16, dark: 0.12 };
    sink.span('plaster3', -W / 2, -0.4, -D / 2, W / 2, podH, D / 2);
    for (const face of tierFaces(-W / 2, W / 2, -D / 2, D / 2)) podiumFront(sink, face, podH, look, 'plaster3');
    // the tiers: [half width, half depth, top] as shares of the lot and the height
    const tiers: Array<readonly [number, number, number]> = [[0.5, 0.46, 0.46], [0.37, 0.42, 0.66], [0.27, 0.36, 0.82], [0.17, 0.28, 0.94], [0.09, 0.17, 1.0]];
    let y = podH;
    for (const [hx, hz, top] of tiers) {
      const x0 = -W * hx, x1 = W * hx, z0 = -D * hz, z1 = D * hz, y1 = Math.max(y + fh, H * top);
      sink.span('stone', x0, y, z0, x1, y1, z1, { shade: 0.82 });
      sink.span('plaster3', x0 - 0.12, y1 - 0.35, z0 - 0.12, x1 + 0.12, y1, z1 + 0.12, SHADOWED);
      for (const face of tierFaces(x0, x1, z0, z1)) deco(sink, face, y + 0.3, y1 - 0.6, fh, brick, look, 0.4);
      y = y1;
    }
    flagpole(sink, 0, y, 0, 5, look);
    scars(sink, tierFaces(-W / 2, W / 2, -D / 2, D / 2)[0], podH, look, mobile);
  });
  return sink.finish();
};

// ------------------------------------------------------------------------------------------------ the Park Hotel

/** The Park Hotel: the black granite base, the dark brown shaft of piers, the stepped crown. */
const parkHotel: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const f = fillOf(ctx.bounds, 0.1);
  sink.placed(0, f.cx, 0, f.cz, () => {
    const look = ctx.variant, mobile = ctx.tier === 'mobile';
    const W = clampTo(f.w, 5, 60), D = clampTo(f.d, 5, 60), H = clampTo(ctx.info.h, 8, 90);
    const baseH = Math.min(12.5, H * 0.2), fh = 3.2;
    const shaft: FacadeStyle = { pitch: 1.45, pier: 0.55, pierBucket: 'stone', pierOut: 0.3, pierShade: 0.5, spandrel: rgb(0x2e221c), lit: 0.18, dark: 0.1 };
    sink.span('plaster3', -W / 2, -0.4, -D / 2, W / 2, baseH, D / 2, { shade: 0.38 });
    for (const face of tierFaces(-W / 2, W / 2, -D / 2, D / 2)) podiumFront(sink, face, baseH, look, 'plaster3', 0.32);
    const tiers: Array<readonly [number, number, number]> = [[0.43, 0.43, 0.8], [0.35, 0.35, 0.88], [0.26, 0.26, 0.94], [0.16, 0.16, 1.0]];
    let y = baseH;
    tiers.forEach(([hx, hz, top], i) => {
      const x0 = -W * hx, x1 = W * hx, z0 = -D * hz, z1 = D * hz, y1 = Math.max(y + fh, H * top);
      sink.span('stone', x0, y, z0, x1, y1, z1, { shade: 0.52 });
      for (const face of tierFaces(x0, x1, z0, z1)) deco(sink, face, y + 0.2, y1 - (i === 0 ? 0.4 : 0.2), fh, shaft, look, 0.3);
      y = y1;
    });
    // the entrance canopy over the front door
    const front = tierFaces(-W / 2, W / 2, -D / 2, D / 2)[0];
    faceBox(sink, 'structureMetal', front, 0, 4.4, 0.9, Math.min(W * 0.4, 6), 0.3, 1.8, { colour: BRONZE, ...SHADOWED });
    flagpole(sink, 0, y, 0, 4, look);
    scars(sink, front, baseH, look, mobile);
  });
  return sink.finish();
};

// ------------------------------------------------------------------------------------------------ Sassoon House

/** Sassoon House: the granite block, its front tower and the green copper pyramid over it. */
const sassoonHouse: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const f = fillOf(ctx.bounds, 0.1);
  sink.placed(0, f.cx, 0, f.cz, () => {
    const look = ctx.variant, mobile = ctx.tier === 'mobile';
    const W = clampTo(f.w, 5, 60), D = clampTo(f.d, 5, 60), H = clampTo(ctx.info.h, 8, 90);
    const fh = 3.6, blockTop = Math.max(fh * 2, H * 0.55), towerTop = Math.max(blockTop + fh, H * 0.74);
    const granite: FacadeStyle = { pitch: 1.9, pier: 0.6, pierBucket: 'plaster3', pierOut: 0.22, spandrel: BRONZE, lit: 0.2, dark: 0.08 };
    sink.span('plaster3', -W / 2, -0.4, -D / 2, W / 2, blockTop, D / 2);
    sink.span('plaster3', -W / 2 - 0.1, blockTop - 0.5, -D / 2 - 0.1, W / 2 + 0.1, blockTop, D / 2 + 0.1, SHADOWED);
    const faces = tierFaces(-W / 2, W / 2, -D / 2, D / 2);
    for (const face of faces) {
      podiumFront(sink, face, 5.0, look, 'plaster3');
      deco(sink, face, 5.4, blockTop - 0.6, fh, granite, look, 0.5);
    }
    // the tower on the front, its parapet, the pyramid
    const tx = Math.min(W * 0.22, 6), td = Math.min(D * 0.44, 2 * tx), tz1 = D / 2, tz0 = tz1 - td;
    sink.span('plaster3', -tx, blockTop, tz0, tx, towerTop, tz1);
    for (const face of tierFaces(-tx, tx, tz0, tz1)) deco(sink, face, blockTop + 0.3, towerTop - 0.8, fh, granite, look, 0.4);
    sink.span('plaster3', -tx - 0.15, towerTop, tz0 - 0.15, tx + 0.15, towerTop + 0.9, tz1 + 0.15);
    pyramid(sink, 'structureMetal', 0, (tz0 + tz1) / 2, tx, td / 2, towerTop + 0.9, Math.max(towerTop + 3, H), { colour: COPPER_GREEN });
    flagpole(sink, 0, Math.max(towerTop + 3, H) - 0.2, (tz0 + tz1) / 2, 3, look);
    scars(sink, faces[0], 5, look, mobile);
  });
  return sink.finish();
};

// ------------------------------------------------------------------------------------------------ the Bank of China

/** The Bank of China: golden granite wings, the tower over them, the lattice band, the green-tiled pyramid roof. */
const bankOfChina: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const f = fillOf(ctx.bounds, 0.1);
  sink.placed(0, f.cx, 0, f.cz, () => {
    const look = ctx.variant, mobile = ctx.tier === 'mobile';
    const W = clampTo(f.w, 5, 60), D = clampTo(f.d, 5, 60), H = clampTo(ctx.info.h, 8, 90);
    const fh = 3.4, wingTop = Math.max(fh * 2, H * 0.36), towerTop = Math.max(wingTop + fh, H * 0.84);
    const gold: FacadeStyle = { pitch: 1.6, pier: 0.55, pierBucket: 'plaster2', pierOut: 0.26, spandrel: rgb(0x6b5a3e), lit: 0.18, dark: 0.08 };
    sink.span('plaster2', -W / 2, -0.4, -D / 2, W / 2, wingTop, D / 2);
    sink.span('plaster2', -W / 2 - 0.1, wingTop - 0.45, -D / 2 - 0.1, W / 2 + 0.1, wingTop, D / 2 + 0.1, SHADOWED);
    const faces = tierFaces(-W / 2, W / 2, -D / 2, D / 2);
    for (const face of faces) {
      podiumFront(sink, face, 5.2, look, 'plaster2');
      deco(sink, face, 5.6, wingTop - 0.5, fh, gold, look, 0.5);
    }
    const tx = W * 0.3, tz = D * 0.4;
    sink.span('plaster2', -tx, wingTop, -tz, tx, towerTop, tz);
    const tfaces = tierFaces(-tx, tx, -tz, tz);
    for (const face of tfaces) {
      deco(sink, face, wingTop + 0.3, towerTop - 2.4, fh, gold, look, 0.4);
      // the band of Chinese lattice under the roof
      facePanel(sink, 'structureMetal', face, 0, towerTop - 1.2, 0.03, face.width - 0.6, 1.6, { colour: rgb(0x5a4a33), decor: true });
      if (!mobile) for (let k = 0; k < Math.round(face.width / 0.9); k++) {
        faceBox(sink, 'plaster2', face, -face.width / 2 + 0.45 + k * 0.9, towerTop - 1.2, 0.06, 0.1, 1.5, 0.06, { decor: true, fine: true });
      }
    }
    // the roof: a pyramid of green glazed tile on its eaves, the finial
    const roof: RoofSpec = { kind: 'hip', pitchDeg: 27, eave: 0.9, verge: 0.9, thickness: 0.28, bucket: 'structureMetal', ridge: null };
    const rg = roofGeometry(2 * tx, 2 * tz, towerTop, roof);
    emitRoof(sink, rg, roof, rgb(0x3e6a60));
    sink.cylinder('structureMetal', [0, rg.ridgeTopY - 0.1, 0], 'y', 1.6, 0.18, 6, { colour: GILT, decor: true, shadow: true }, 0.06);
    scars(sink, faces[0], 5, look, mobile);
  });
  return sink.finish();
};

// ------------------------------------------------------------------------------------------------ the Customs House

/** The Customs House: granite, the Doric columns in the recessed front, the clock tower stepping up to its cap. */
const customsHouse: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const f = fillOf(ctx.bounds, 0.1);
  sink.placed(0, f.cx, 0, f.cz, () => {
    const look = ctx.variant, mobile = ctx.tier === 'mobile';
    const W = clampTo(f.w, 5, 60), D = clampTo(f.d, 5, 60), H = clampTo(ctx.info.h, 8, 90);
    const fh = 3.6, blockTop = Math.max(fh * 2, H * 0.47);
    const granite: FacadeStyle = { pitch: 2.0, pier: 0.65, pierBucket: 'plaster3', pierOut: 0.2, spandrel: rgb(0x8c867b), lit: 0.22, dark: 0.06 };
    // the block with its front's middle recessed behind the columns
    const rec = Math.min(2.2, D * 0.12), pw = Math.min(W * 0.42, 11);
    sink.span('plaster3', -W / 2, -0.4, -D / 2, W / 2, blockTop, D / 2 - rec);
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
    facePanel(sink, 'glass', recess, 0, 3.4, 0.02, pw - 1.2, 5.2, { decor: true, window: recess.out });
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
    for (const face of tierFaces(-tx, tx, tzc - tz, tzc + tz)) {
      deco(sink, face, blockTop + 0.4, clockY - 2.0, fh, granite, look, 0.4);
      faceBox(sink, 'structureMetal', face, 0, clockY, 0.04, Math.min(face.width * 0.62, 4), Math.min(face.width * 0.62, 4), 0.06, { colour: WHITE_TRIM, decor: true });
      faceBox(sink, 'structureMetal', face, 0, clockY + 0.45, 0.09, 0.08, 0.95, 0.03, { colour: IRON, decor: true, fine: true });
      faceBox(sink, 'structureMetal', face, 0.3, clockY, 0.09, 0.62, 0.08, 0.03, { colour: IRON, decor: true, fine: true });
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
    sink.span('plaster3', -W / 2, -0.4, -D / 2, W / 2, top, D / 2 - rec);
    if (rec > 0) {
      sink.span('plaster3', -W / 2, -0.4, D / 2 - rec, -pw / 2, top, D / 2);
      sink.span('plaster3', pw / 2, -0.4, D / 2 - rec, W / 2, top, D / 2);
    }
    // the cornice and the attic over it
    sink.span('plaster3', -W / 2 - 0.15, top - 0.5, -D / 2 - 0.15, W / 2 + 0.15, top, D / 2 + 0.15, SHADOWED);
    sink.span('plaster3', -W / 2 + 0.3, top, -D / 2 + 0.3, W / 2 - 0.3, top + 1.1, D / 2 - 0.3);
    const faces = tierFaces(-W / 2, W / 2, -D / 2, D / 2);
    faces.forEach((face, fi) => {
      // the rusticated ground storey's arched windows and the courses between, the piano nobile's tall windows
      const n = Math.max(1, Math.round((face.width - 1.2) / 3.0)), pitch = (face.width - 1.2) / n;
      for (let k = 0; k < n; k++) {
        const u = -face.width / 2 + 0.6 + pitch * (k + 0.5);
        if (fi === 0 && rec > 0 && Math.abs(u) < pw / 2 + 0.2) continue;
        facePanel(sink, look() < 0.2 ? 'curtain' : 'glass', face, u, 2.3, 0.012, 1.5, 2.8, { decor: true, window: face.out });
        faceBox(sink, 'plaster3', face, u, 3.85, 0.07, 0.5, 0.42, 0.14, { decor: true, fineSides: true });
        for (let st = 0; st < 2; st++) windowUnit(sink, face, u, ground + st * sh + 0.7, 1.3, st === 0 ? 2.5 : 2.0, BUND_WINDOW, look, 0.25);
      }
      if (!mobile) for (const y of [1.25, 2.5, 3.75]) faceBox(sink, 'dark', face, 0, y, 0.008, face.width - 0.2, 0.05, 0.01, { decor: true, fine: true });
      faceBox(sink, 'plaster3', face, 0, ground, 0.08, face.width, 0.28, 0.16, { decor: true, fineSides: true });
    });
    const front = faces[0];
    if (kind === 'portico') {
      const cols = 6;
      for (let k = 0; k < cols; k++) {
        const x = -pw / 2 + 0.8 + k * (pw - 1.6) / (cols - 1);
        sink.cylinder('plaster3', [x, ground, D / 2 - 0.6], 'y', top - ground - 0.5, 0.48, 10, SHADOWED, 0.42);
      }
      sink.prism('plaster3', [facePoint(front, -pw / 2, top), facePoint(front, pw / 2, top), facePoint(front, 0, top + 2.4)], [0, 0, -1], 1.4, SHADOWED);
      const recess: Face = { origin: [0, 0, D / 2 - rec], u: [1, 0, 0], out: [0, 0, 1], width: pw };
      facePanel(sink, 'glass', recess, 0, 2.6, 0.02, pw - 1.6, 3.6, { decor: true, window: recess.out });
      for (let st = 0; st < 2; st++) for (let k = 0; k < 5; k++) windowUnit(sink, recess, -pw / 2 + 1.4 + k * (pw - 2.8) / 4, ground + st * sh + 0.7, 1.1, 2.2, BUND_WINDOW, look, 0.25);
    } else if (kind === 'dome') {
      // the drum and its windows, the dome in three courses, the lantern
      const r = Math.min(W, D) * 0.19, y0 = top + 1.1;
      sink.cylinder('plaster3', [0, y0, 0], 'y', 3.2, r, 16, SHADOWED);
      const drum = (a: number): Face => ({ origin: [Math.sin(a) * r, 0, Math.cos(a) * r], u: [Math.cos(a), 0, -Math.sin(a)], out: [Math.sin(a), 0, Math.cos(a)], width: 1 });
      for (let k = 0; k < 8; k++) facePanel(sink, 'glass', drum((k / 8) * Math.PI * 2 + Math.PI / 8), 0, y0 + 1.6, 0.02, 0.8, 1.8, DEC);
      const copper = { colour: COPPER_GREEN, ...SHADOWED };
      sink.cylinder('structureMetal', [0, y0 + 3.2, 0], 'y', r * 0.38, r * 1.04, 16, copper, r * 0.9);
      sink.cylinder('structureMetal', [0, y0 + 3.2 + r * 0.38, 0], 'y', r * 0.34, r * 0.9, 16, copper, r * 0.62);
      sink.cylinder('structureMetal', [0, y0 + 3.2 + r * 0.72, 0], 'y', r * 0.28, r * 0.62, 16, copper, r * 0.2);
      sink.cylinder('plaster3', [0, y0 + 3.2 + r, 0], 'y', 1.6, Math.max(0.35, r * 0.16), 8, SHADOWED);
      sink.cylinder('structureMetal', [0, y0 + 4.8 + r, 0], 'y', 0.9, Math.max(0.4, r * 0.18), 8, copper, 0.05);
    } else {
      // the corner turrets on the front, their copper caps
      const tw = Math.min(4.2, W * 0.16, D * 0.22);
      for (const side of [-1, 1]) {
        const x0 = side < 0 ? -W / 2 : W / 2 - tw, z0 = D / 2 - tw;
        sink.span('plaster3', x0, top, z0, x0 + tw, top + 4.4, D / 2);
        for (const face of tierFaces(x0, x0 + tw, z0, D / 2)) windowUnit(sink, face, 0, top + 1.6, 1.0, 1.8, BUND_WINDOW, look, 0.2);
        pyramid(sink, 'structureMetal', x0 + tw / 2, z0 + tw / 2, tw / 2 + 0.2, tw / 2 + 0.2, top + 4.4, top + 7.8, { colour: COPPER_GREEN, ...SHADOWED });
      }
    }
    // the bank's doors and its name over them, sandbags along the front
    if (kind !== 'portico') {
      facePanel(sink, 'dark', front, 0, 2.0, 0.02, 2.4, 3.6, DEC);
      faceBox(sink, 'structureMetal', front, 0, 4.25, 0.1, 4.2, 0.45, 0.04, { colour: BRONZE, decor: true });
      faceBox(sink, 'structureMetal', front, 0, 4.25, 0.13, 3.2, 0.2, 0.01, { colour: GILT, decor: true, fine: true });
    }
    if (look() < 0.6) sandbags(sink, front, 0, 0, Math.min(W * 0.4, 8), 1.4, look);
    scars(sink, front, ground, look, mobile);
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
    sink.span(wall, -W / 2, -0.4, -D / 2, W / 2, roofY, D / 2);
    sink.span(wall, -W / 2, roofY, -D / 2, W / 2, roofY + 0.9, -D / 2 + 0.25, SHADOWED);
    sink.span(wall, -W / 2, roofY, D / 2 - 0.25, W / 2, roofY + 0.9, D / 2, SHADOWED);
    sink.span(wall, -W / 2, roofY, -D / 2 + 0.25, -W / 2 + 0.25, roofY + 0.9, D / 2 - 0.25, SHADOWED);
    sink.span(wall, W / 2 - 0.25, roofY, -D / 2 + 0.25, W / 2, roofY + 0.9, D / 2 - 0.25, SHADOWED);
    const tower = !brick && look() < 0.7, bw = Math.min(W * 0.22, 6.5);
    if (tower) {
      sink.span(wall, -bw / 2, roofY, D / 2 - 4.2, bw / 2, roofY + 3.6, D / 2);
      const tf: Face = { origin: [0, 0, D / 2], u: [1, 0, 0], out: [0, 0, 1], width: bw };
      faceBox(sink, 'structureMetal', tf, 0, roofY + 2.2, 0.03, bw - 1.0, 0.9, 0.04, { colour: rgb(0x3a3733), decor: true });
      faceBox(sink, 'structureMetal', tf, 0, roofY + 2.2, 0.06, bw - 1.6, 0.42, 0.01, { colour: WHITE_TRIM, decor: true, fine: true });
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
    faces.forEach((face, fi) => {
      const hit = fi === attacked;
      const n = Math.max(1, Math.round((face.width - 0.8) / 3.0)), pitch = (face.width - 0.8) / n;
      for (let f2 = 0; f2 < floors; f2++) {
        const y = f2 * fh;
        for (let k = 0; k < n; k++) {
          const u = -face.width / 2 + 0.4 + pitch * (k + 0.5), r = look();
          const gw = pitch - 1.0, gh = fh * 0.5;
          if (fi === 0 && tower && Math.abs(u) < bw / 2) continue;
          if (r < (hit ? 0.55 : 0.2)) {
            facePanel(sink, 'dark', face, u, y + fh * 0.55, 0.012, gw, gh, DEC);
            if (look() < 0.5) sandbags(sink, face, u, y + fh * 0.3, gw, gh * 0.6, look);
          } else facePanel(sink, r < 0.85 ? 'glass' : 'curtain', face, u, y + fh * 0.55, 0.012, gw, gh, { decor: true, window: face.out });
          if (hit && !mobile && look() < 0.35) breach(sink, face, u + (look() - 0.5) * pitch, y + fh * 0.5, 0.5 + look() * 0.5, look);
        }
        // the floor's slab edge across the face
        faceBox(sink, wall, face, 0, y + fh - 0.12, 0.08, face.width, 0.3, 0.16, { decor: true, fineSides: true });
      }
      for (let k = 0; k <= n; k++) faceBox(sink, 'structureMetal', face, -face.width / 2 + 0.4 + pitch * k, roofY / 2, 0.1, 0.5, roofY, 0.2, { colour: frame, decor: true, fineSides: true });
      if (hit) scars(sink, face, roofY, look, mobile, true);
    });
    // the loading bays on the street front
    const front = faces[0];
    for (const side of [-1, 1]) {
      facePanel(sink, 'dark', front, side * W * 0.3, 1.5, 0.02, 3.0, 3.0, DEC);
      faceBox(sink, 'structureWood', front, side * W * 0.3, 0.5, 0.6, 3.6, 1.0, 1.2, { colour: rgb(0x4a4038), decor: true });
    }
    if (!mobile) soot(sink, faces[attacked], -faces[attacked].width * 0.3, faces[attacked].width * 0.1, roofY * 0.5, roofY);
    if (look() < 0.5) faceBox(sink, 'structureMetal', front, 0, 0.6, 0.6, Math.min(W * 0.3, 7), 1.2, 1.1, { colour: CHAR, decor: true });
  });
  return sink.finish();
};

export const SHANGHAI_BUND_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  arcology: broadwayMansions,
  needletower: parkHotel,
  megatower: sassoonHouse,
  terracetower: bankOfChina,
  broadcasttower: customsHouse,
  civichall: bundBank,
  parkingdeck: sihangWarehouse,
});

export type { RegionalBuildContext, RegionalParts, shade };
