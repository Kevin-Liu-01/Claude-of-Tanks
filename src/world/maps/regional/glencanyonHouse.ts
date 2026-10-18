// src/world/maps/regional/glencanyonHouse.ts — Page's ranch houses (the Glen Canyon kit, maps/regional/glencanyon.ts;
// Skybridge's Page township). Page was laid out on Manson Mesa in 1957 as the Bureau of Reclamation's construction
// town for Glen Canyon Dam: its houses were one-storey ranch houses on a concrete stem wall, under a shallow gable of
// asphalt shingle, in stucco, in painted concrete block or framed and sided in painted lap boards, with aluminium sash
// and a picture window to the street, a carport on steel posts beside them, and on nearly every roof an evaporative
// ("swamp") cooler on its stand over the duct into the house, the desert town's air conditioning before the 1970s.
//
// (227, the looks lane: the building-detail census's lift toward Verdant's element set, BLD-04) The house as Page
// finished it, through the house grammar and the shared opening, facade and dressing helpers, its body and collision as
// they were (the build stream draws as before; every new part is dressing): the stucco and sided houses' windows each in
// a painted casing (the block houses' set in the block with their precast sills); the picture window's two side sashes;
// on the Colonial-ranch houses their louvred shutters on the street and side windows, on a desktop build their stiles,
// rails and cut-outs painted; the sided houses' lap boards and corner boards; the front entry's porch under a lean-to on
// slim iron posts (a hood over the door where it has none); the swamp cooler on its stand on the back of the roof, its
// louvred pads and its duct; and on a desktop build the stem wall's paint, the louvred vents in the gables, the furnace's
// flue, the television mast, the porch light, the oleanders and the block planter under the picture window.
import { PartSink, faceBox, facePoint, pick, rgb, shade, streamFrom, type Face, type RegionalBucket, type Rgb } from './geometry.ts';
import { buildHouse, leanTo, windowRhythm, type HouseFrame, type Opening } from './house.ts';
import { doorUnit, windowUnit, type WindowStyle } from './openings.ts';
import { mound, tvAerial, wallLantern } from './dressing.ts';
import { doorCanopy, facadeOn, facadeRng, plinthPaint } from './facade.ts';

/** Poured concrete (the plaster2 canvas under the kit's concrete tone), painted concrete, block, stucco (glencanyon.ts). */
const CONCRETE: RegionalBucket = 'plaster2', PAINTED: RegionalBucket = 'plaster3', BLOCK: RegionalBucket = 'stone', STUCCO: RegionalBucket = 'plaster';
const ALUMINIUM = rgb(0xb8bdbd), WHITE = rgb(0xe4e2dc), IRON = rgb(0x26282a), GALV = rgb(0xa6aaa7);
const DOOR_PAINT: readonly Rgb[] = [0x2f5f8a, 0x8a3a2c, 0x4d6f45, 0xc9a24a, 0x6a4a3a].map(rgb);
const CAR_ROOF: readonly Rgb[] = [0x9aa09c, 0xb8b4a8, 0x8a8478].map(rgb);
/** The sided houses' paints: white, cream, pale yellow, sage, sky, buff. */
const SIDING: readonly Rgb[] = [0xe6e2d6, 0xe2d8b8, 0xdccb8c, 0xb8c8ae, 0xaec2cc, 0xcdb89a].map(rgb);
/** Trim other than white: the 1950s accents (turquoise, brick red, forest green, chocolate). */
const TRIM_ACCENT: readonly Rgb[] = [0x3f8a86, 0x8a3a2c, 0x3f5f44, 0x5a4234].map(rgb);
/** The Colonial-ranch shutters: forest green, black-green, barn red, slate blue, chocolate, white. */
const SHUTTER: readonly Rgb[] = [0x2f4a36, 0x23302a, 0x7a2e26, 0x3c5068, 0x4a3628, 0xdcd8cc].map(rgb);
/** The coolers: galvanised sheet, or painted to the house (sand, white). */
const COOLER: readonly Rgb[] = [0xa9aca8, 0x9ea29f, 0xcfc6b0, 0xd8d6cc].map(rgb);
/** The stem wall's paint (the render stops at its weep screed): grey, red oxide, brown (multipliers over the concrete). */
const STEM: readonly Rgb[] = [0x8a8682, 0x8a5a48, 0x6e5e50].map((hex) => shade(rgb(hex), 1.25));
/** Oleander: pink, red, rose. */
const OLEANDER: readonly Rgb[] = [0xe08aa6, 0xc23a48, 0xd85a78].map(rgb);

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/**
 * The windows' draws: the pane's from the build stream, as the house drew it before it had shutters; a shutter's (its
 * fade and whether it is shut) from the finish's stream, so the build stream stands where it stood after each window
 * and the next house's body on a two-house plot builds as before.
 */
function paneThen(build: () => number, finish: () => number): () => number {
  let first = true;
  return () => {
    if (first) { first = false; return build(); }
    return finish();
  };
}

/** A shutter's two leaves (each half the light and 3 cm, folded back beside it) need that much wall on either side. */
function shutterRoom(o: Opening, openings: readonly Opening[], faceWidth: number, casing: number): boolean {
  const reach = o.w / 2 + casing + o.w / 2 + 0.05;
  if (Math.abs(o.u) + reach > faceWidth / 2 - 0.18) return false;
  for (const q of openings) {
    if (q === o || q.face !== o.face || q.storey !== o.storey) continue;
    const other = q.kind === 'door' ? q.w / 2 + 0.3 : q.w / 2 + casing + (q.w <= 1.4 ? q.w / 2 + 0.05 : 0);
    if (Math.abs(q.u - o.u) < reach + other + 0.06) return false;
  }
  return true;
}

/** The finish's choices for one house (its own stream, the same on every tier). */
interface PageFinish {
  siding: Rgb | null;
  trim: Rgb;
  shutters: Rgb | null;
  porch: 'entry' | 'wide' | 'hood';
  cooler: Rgb | null;
  coolerSide: 1 | -1;
}

/**
 * A Page ranch house at the origin facing +z (its gable to the street): one storey of stucco, painted block or lap
 * siding on a concrete stem wall under a shallow shingled gable, the picture window and the front door with its stoop
 * and porch, the side and back windows, a carport on steel posts beside it (`carport` m wide at +x, none under 2.4 m).
 * The build stream (`rng`) draws for the body as it did; the finish comes from a stream of its own (one draw of the
 * look stream, the same on every tier) and, on a desktop build, the facade stream.
 */
export function pageHouse(sink: PartSink, rng: () => number, look: () => number, W: number, D: number, carport: number): void {
  const wall: RegionalBucket = rng() < 0.55 ? STUCCO : BLOCK;
  const door = pick(rng, DOOR_PAINT);
  const lift = streamFrom((look() * 4294967296) >>> 0);
  const finish: PageFinish = {
    // a share of the stucco houses framed and sided instead (the Bureau's and the contractors' frame houses)
    siding: wall === STUCCO && lift() < 0.4 ? pick(lift, SIDING) : null,
    trim: lift() < 0.7 ? WHITE : pick(lift, TRIM_ACCENT),
    shutters: lift() < 0.55 ? pick(lift, SHUTTER) : null,
    porch: (() => { const p = lift(); return p < 0.4 ? 'entry' : p < 0.7 ? 'wide' : 'hood'; })(),
    cooler: lift() < 0.85 ? pick(lift, COOLER) : null,
    coolerSide: lift() < 0.5 ? 1 : -1,
  };
  const body: RegionalBucket = finish.siding ? 'structureWood' : wall;
  // the casing round a stucco or sided house's windows (a block house's are set in the block on their precast sills)
  const casing = wall === STUCCO ? 0.08 : 0;
  const du = -W * 0.18;
  const openings: Opening[] = [
    { face: 'front', storey: 0, kind: 'door', u: du, w: 0.95, y0: 0, h: 2.05 },
    { face: 'front', storey: 0, kind: 'window', u: W * 0.2, w: 2.4, h: 1.4, y0: 0.8 },
  ];
  for (const face of ['left', 'right'] as const) for (const o of windowRhythm(face, 0, D, { w: 1.1, h: 1.1, sill: 1.0, spacing: 3.0, margin: 1.2, max: 2 })) openings.push(o);
  for (const o of windowRhythm('back', 0, W, { w: 1.1, h: 1.0, sill: 1.1, spacing: 3.0, margin: 1.2, max: 3 })) openings.push(o);
  const sill: WindowStyle['sill'] = finish.siding ? { bucket: 'structureWood', out: 0.06, colour: finish.trim } : { bucket: PAINTED, out: 0.06 };
  const surround: WindowStyle['surround'] = casing ? { bucket: 'structureWood', width: casing, out: 0.025, lintel: 0.1, colour: finish.trim } : null;
  const sash: WindowStyle = { frame: ALUMINIUM, frameWidth: 0.05, frameOut: 0.04, bars: 'cross', surround, sill, shutters: null };
  // the picture window: one fixed light between two narrow sashes (their mullions laid after the unit)
  const picture: WindowStyle = { ...sash, bars: 'none' };
  const craft = facadeOn() ? facadeRng() : null;
  const shutterPaint = finish.shutters && craft
    ? { border: shade(finish.shutters, finish.shutters[0] > 0.6 ? 0.86 : 1.3), motif: craft() < 0.45 ? 'diamond' as const : craft() < 0.5 ? 'heart' as const : null }
    : undefined;
  const windowStyle = (o: Opening): WindowStyle => {
    if (o.w > 1.8) return picture;
    const faceWidth = o.face === 'front' || o.face === 'back' ? W : D;
    if (!finish.shutters || o.face === 'back' || !shutterRoom(o, openings, faceWidth, casing)) return sash;
    return { ...sash, shutters: { colour: finish.shutters, kind: 'louvred', closed: 0, ...(shutterPaint ? { paint: shutterPaint } : {}) } };
  };
  const chimneys = rng() < 0.4 ? [{ x: W * 0.3, z: -D * 0.15, sx: 0.5, sz: 0.5, above: 0.5, bucket: BLOCK, cap: 'slab' as const }] : [];
  const gutters = rng() < 0.5 ? { colour: finish.trim === WHITE ? WHITE : GALV } : null;
  const leaf = rng() < 0.5 ? 'panel' as const : 'glazed' as const;
  const share = look() < 0.45 ? 1 : 0;
  // (a sided house's walls are its paint on the painted-timber surface: queenstown.ts cottageRow)
  sink.paint = finish.siding;
  let frame: HouseFrame;
  try {
    frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.35, out: 0.04, bucket: CONCRETE }, storeys: [{ h: 2.55, wall: body }],
      roof: { kind: 'gable', pitchDeg: 17, eave: 0.55, verge: 0.4, thickness: 0.1, bucket: 'roof', ridge: 'saddle' }, gableBucket: body,
      openings, chimneys, gutters, verge: { colour: finish.trim, bucket: 'structureWood' }, reveal: 0.14, rafters: null,
      ...(finish.siding ? { spall: null } : {}),
    }, {
      window: (s, face, o, y0) => {
        const y = y0 + o.y0;
        windowUnit(s, face, o.u, y, o.w, o.h, windowStyle(o), paneThen(rng, lift), share);
        if (o.w > 1.8) {
          // the picture window's side sashes: two mullions a fifth of the way in from its jambs, at the back of the reveal
          const back = s.recess > 0 ? -s.recess : 0;
          for (const side of [-1, 1]) {
            faceBox(s, 'structureWood', face, o.u + side * (o.w * 0.3), y + o.h / 2, back + 0.025, 0.05, o.h - 0.1, 0.04, { colour: ALUMINIUM, decor: true, fine: true }, 'caps');
          }
        }
      },
      door: (s, face, o, y0, fr) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, {
        leaf: door, frame: finish.siding ? { bucket: 'structureWood', width: 0.1, out: 0.04, colour: finish.trim } : { bucket: PAINTED, width: 0.1, out: 0.04 },
        steps: { bucket: CONCRETE }, leafKind: leaf,
      }, fr.floors[o.storey] + o.y0),
    });
  } finally { sink.paint = null; }
  if (finish.siding) lapSiding(sink, frame, finish.siding, finish.trim, casing);
  porch(sink, frame, finish, du);
  if (finish.cooler) swampCooler(sink, frame, chimneys.length ? -1 : finish.coolerSide, -D * 0.22, finish.cooler);
  if (craft) pageDressing(sink, frame, craft, finish, { du, W, D, chimney: chimneys.length > 0, carport: carport > 2.4 });
  if (carport > 2.4) {
    // the carport (props census #3, lane B 2026-10-14; the judges: "a flat slab on two sticks"): its pad, three steel
    // posts along the outer edge to the fascia beam, the ledger on the house wall, the rafters across and the ribbed
    // sheet roof falling outward over them
    const x0 = W / 2, x1 = W / 2 + carport, sheet = pick(look, CAR_ROOF), hi = 2.75, lo = 2.55;
    sink.span(CONCRETE, x0, -0.2, -D / 2 - 0.1, x1 + 0.1, 0.06, D / 2 + 0.4, { decor: true, shade: 0.92 });
    for (const z of [-D / 2 + 0.3, 0, D / 2 + 0.1]) sink.cylinder('structureMetal', [x1 - 0.15, 0.06, z], 'y', lo - 0.2, 0.05, 8, { colour: WHITE });
    sink.span('structureMetal', x1 - 0.22, lo - 0.2, -D / 2 - 0.1, x1 - 0.08, lo, D / 2 + 0.4, { colour: WHITE });
    sink.span('structureWood', x0, hi - 0.2, -D / 2 - 0.1, x0 + 0.08, hi, D / 2 + 0.4, { colour: WHITE, decor: true });
    for (let z = -D / 2 + 0.2; z < D / 2 + 0.4; z += 1.2) sink.member('structureWood', [x0 + 0.08, hi - 0.1, z], [x1 - 0.08, lo - 0.1, z], 0.05, 0.14, [0, 1, 0], { colour: WHITE, decor: true }, 0);
    const slope = (hi - lo) / (x1 - x0);
    sink.quad('structureMetal', [x0, hi + 0.04, D / 2 + 0.45], [x1 + 0.1, lo - slope * 0.1 + 0.04, D / 2 + 0.45], [x1 + 0.1, lo - slope * 0.1 + 0.04, -D / 2 - 0.15], [x0, hi + 0.04, -D / 2 - 0.15], { colour: sheet, shadow: true });
    sink.quad('structureMetal', [x0, hi, -D / 2 - 0.15], [x1 + 0.1, lo - slope * 0.1, -D / 2 - 0.15], [x1 + 0.1, lo - slope * 0.1, D / 2 + 0.45], [x0, hi, D / 2 + 0.45], { colour: shade(sheet, 0.6), decor: true });
    for (let z = -D / 2; z < D / 2 + 0.4; z += 0.6) sink.member('structureMetal', [x0, hi + 0.06, z], [x1 + 0.1, lo - slope * 0.1 + 0.06, z], 0.03, 0.03, [0, 1, 0], { colour: shade(sheet, 0.9), decor: true, fine: true }, 0);
  }
}

/**
 * A sided house's lap boards: a shadow line under each board every 20 cm up the walls and the gables, broken at the
 * openings' casings, and the corner boards in the trim's paint (fine: drawn near the camera only).
 */
function lapSiding(sink: PartSink, frame: HouseFrame, paint: Rgb, trim: Rgb, casing: number): void {
  const ops = frame.spec.openings, y0 = frame.floors[0], top = frame.eaveY, rg = frame.roof;
  const line = { colour: shade(paint, 0.82), decor: true, fine: true } as const;
  for (const name of ['front', 'right', 'back', 'left'] as const) {
    const f = frame.faces[name], half = f.width / 2 - 0.1;
    const gable = (name === 'front' || name === 'back') && rg.gable;
    const yMax = gable ? rg.ridgeY - 0.25 : top - 0.06;
    for (let y = y0 + 0.2; y < yMax; y += 0.2) {
      // over the eave a gable's boards run between its rakes
      const reach = y > top ? Math.min(half, (rg.ridgeY - y) / rg.tanP - 0.12) : half;
      if (reach < 0.3) continue;
      const gaps = ops.filter((o) => o.face === name && y > y0 + o.y0 - 0.12 && y < y0 + o.y0 + o.h + 0.16)
        .map((o) => [o.u - o.w / 2 - casing - 0.03, o.u + o.w / 2 + casing + 0.03] as const).sort((a, b) => a[0] - b[0]);
      let at = -reach;
      for (const [a, b] of [...gaps, [reach, reach] as const]) {
        const end = Math.min(a, reach);
        if (end - at > 0.2) faceBox(sink, 'structureWood', f, (at + end) / 2, y, 0.006, end - at, 0.025, 0.012, line, 'ends');
        at = Math.max(at, b);
      }
    }
    // the corner boards up the wall's two ends
    for (const side of [-1, 1]) faceBox(sink, 'structureWood', f, side * (f.width / 2 - 0.06), (y0 + top) / 2, 0.012, 0.12, top - y0, 0.024, { colour: trim, decor: true });
  }
}

/**
 * The front entry's porch (every tier; its parts dressing): a shed roof of the house's shingle on a plate carried by
 * slim iron posts, leaning off the gable wall from under the window heads — over the door and its stoop ('entry'), or
 * on along the front over the picture window ('wide') — or, on a house with neither, a hood over the door.
 */
function porch(sink: PartSink, frame: HouseFrame, finish: PageFinish, du: number): void {
  const f = frame.faces.front, half = f.width / 2, ops = frame.spec.openings;
  const pw = ops.find((o) => o.face === 'front' && o.kind === 'window');
  const doorTop = frame.floors[0] + 2.05;
  const highY = frame.eaveY - 0.14;
  if (finish.porch === 'hood' || !pw) {
    // a hood over the door on its brackets (facade.ts doorCanopy: a sheet-metal shed in the trim's paint)
    doorCanopy(sink, f, du, doorTop, 0.95, { kind: 'shed', bucket: 'structureMetal', colour: shade(finish.trim, 0.95), timber: finish.trim === WHITE ? IRON : finish.trim, depth: 0.9 });
    return;
  }
  const u0 = Math.max(-half + 0.15, du - 1.05);
  const u1 = finish.porch === 'wide' ? Math.min(half - 0.15, pw.u + pw.w / 2 + 0.45) : Math.min(du + 1.25, pw.u - pw.w / 2 - 0.12);
  if (u1 - u0 < 1.6) return;
  const depth = 1.7, posts = finish.porch === 'wide' ? [u0 + 0.1, (u0 + u1) / 2, u1 - 0.1] : [u0 + 0.1, u1 - 0.1];
  const iron = finish.trim === WHITE ? IRON : finish.trim;
  // (the lean-to lays the roof alone: its plate and posts are laid here as dressing, as leanTo lays them, so the
  // house's collision stays its body's)
  // the cover: a sheet of ribbed aluminium (the 1950s patio cover), white or in the trim's colour, its ribs down the fall
  const sheet = finish.trim === WHITE ? ALUMINIUM : finish.trim, pitch = 7, eave = 0.18;
  const laid = leanTo(sink, {
    face: f, u0, u1, depth, highY,
    roof: { pitchDeg: pitch, eave, verge: 0.12, thickness: 0.05, bucket: 'structureMetal', decor: true },
    roofColour: sheet, posts: null, plate: null,
  });
  const skin = 0.05 / Math.cos(pitch * Math.PI / 180);
  const topAt = (o: number) => { const q = facePoint(f, (u0 + u1) / 2, 0, o); return laid.shed.undersideAt(q[0], q[2]) + skin; };
  const yWall = topAt(0.02), yEave = topAt(depth + eave - 0.02);
  for (let u = u0 - 0.06; u <= u1 + 0.06; u += 0.32) {
    sink.member('structureMetal', facePoint(f, u, yWall + 0.012, 0.02), facePoint(f, u, yEave + 0.012, depth + eave - 0.02), 0.03, 0.025, [0, 1, 0],
      { colour: shade(sheet, 0.86), decor: true, fine: true }, 0.01);
  }
  const ph = 0.16, postTop = laid.plateTop - ph;
  faceBox(sink, 'structureWood', f, (u0 + u1) / 2, laid.plateTop - ph / 2, depth, u1 - u0 + 0.1, ph, 0.1, { colour: finish.trim, decor: true });
  // (each post's foot sunk 30 cm, as leanTo sinks its posts: a slope's low side never leaves one hanging; the facade law
  // keeps every part but the wall-foot strip off the ground's shape, facade.selftest)
  for (const u of posts) faceBox(sink, 'structureMetal', f, u, (postTop - 0.3) / 2, depth, 0.07, postTop + 0.3, 0.07, { colour: iron, decor: true }, { top: true });
  // the wrought iron's scrolls: a knee from each post up to the plate (fine)
  for (const u of posts) {
    for (const side of [-1, 1]) {
      if ((u <= u0 + 0.2 && side < 0) || (u >= u1 - 0.2 && side > 0)) continue;
      sink.member('structureMetal', facePoint(f, u, postTop - 0.45, depth), facePoint(f, u + side * 0.38, postTop + 0.01, depth), 0.025, 0.025, f.out,
        { colour: iron, decor: true, exposed: true, fine: true }, 0);
    }
  }
}

/**
 * The evaporative cooler on the back of the roof (every tier; dressing): a sheet-metal cabinet set level on an angle
 * stand over the slope, its louvred pads on three sides (fine), its lid, the duct dropping from its floor into the
 * roof. `side` the slope it stands on (+x or -x), `z` along the ridge.
 */
function swampCooler(sink: PartSink, frame: HouseFrame, side: 1 | -1, z: number, paint: Rgb): void {
  const rg = frame.roof;
  if (rg.kind !== 'gable' || rg.s < 2) return;
  const half = 0.46, h = 0.8, xc = side * clamp(rg.s * 0.42, 1.0, rg.s - 0.9);
  const xUp = xc - side * half, xDown = xc + side * half;
  const yUp = rg.topAt(xUp, z), yDown = rg.topAt(xDown, z), yMid = rg.topAt(xc, z);
  if (yUp === null || yDown === null || yMid === null) return;
  const base = yUp + 0.12, opts = { colour: paint, decor: true } as const;
  const lo = Math.min(xUp, xDown), hi = Math.max(xUp, xDown);
  // the duct from the roof into the cabinet's floor
  sink.span('structureMetal', xc - 0.24, yMid - 0.1, z - 0.24, xc + 0.24, base + 0.02, z + 0.24, { colour: shade(paint, 0.88), decor: true });
  // the stand: its legs to the roof at the four corners, the rails under the cabinet
  for (const dz of [-half + 0.05, half - 0.05]) {
    for (const [lx, ly] of [[xDown - side * 0.06, yDown], [xUp + side * 0.06, yUp]] as const) {
      sink.span('structureMetal', lx - 0.025, ly - 0.05, z + dz - 0.025, lx + 0.025, base, z + dz + 0.025, { colour: IRON, decor: true });
    }
    sink.span('structureMetal', lo, base - 0.05, z + dz - 0.025, hi, base, z + dz + 0.025, { colour: IRON, decor: true });
  }
  // the cabinet, its lid and the pads' louvres
  sink.span('structureMetal', lo, base, z - half, hi, base + h, z + half, opts);
  sink.span('structureMetal', lo - 0.04, base + h, z - half - 0.04, hi + 0.04, base + h + 0.05, z + half + 0.04, { colour: shade(paint, 1.06), decor: true });
  const louvre = { colour: shade(paint, 0.62), decor: true, fine: true } as const;
  for (let k = 0; k < 6; k++) {
    const y = base + 0.12 + k * 0.105;
    for (const sz of [-1, 1]) sink.span('structureMetal', lo + 0.07, y, z + sz * half - (sz < 0 ? 0.02 : 0), hi - 0.07, y + 0.035, z + sz * half + (sz > 0 ? 0.02 : 0), louvre);
    const xo = side > 0 ? hi : lo;
    sink.span('structureMetal', Math.min(xo, xo + side * 0.02), y, z - half + 0.07, Math.max(xo, xo + side * 0.02), y + 0.035, z + half - 0.07, louvre);
  }
}

/**
 * A house's desktop finish (every choice from the facade stream, every part dressing): the stem wall's paint; the
 * louvred vents high in the gables; the furnace's flue where there is no stack; the television mast at the ridge; the
 * porch light by the door; the block planter under the picture window with its shrubs; the oleanders at the front's
 * free corners.
 */
function pageDressing(sink: PartSink, frame: HouseFrame, f: () => number, finish: PageFinish,
  h: { du: number; W: number; D: number; chimney: boolean; carport: boolean }): void {
  const spec = frame.spec, ops = spec.openings, rg = frame.roof, plinth = spec.plinth!;
  plinthPaint(sink, CONCRETE, [h.W / 2, h.D / 2], plinth.out, -0.2, plinth.h, pick(f, STEM));
  // the gable vents: a louvred frame under each apex (on the gable's face; the attic behind is closed)
  const rise = rg.ridgeY - frame.eaveY;
  if (rg.gable && rise >= 0.95) {
    const vw = clamp(rise * 0.5, 0.45, 0.7), vh = clamp(rise * 0.32, 0.3, 0.45), vy = frame.eaveY + rise * 0.42;
    for (const face of [frame.faces.front, frame.faces.back]) {
      const c = { colour: finish.trim, decor: true } as const;
      faceBox(sink, 'structureWood', face, 0, vy + vh / 2 + 0.03, 0.02, vw + 0.12, 0.06, 0.04, c, 'ends');
      faceBox(sink, 'structureWood', face, 0, vy - vh / 2 - 0.03, 0.02, vw + 0.12, 0.06, 0.04, c, 'ends');
      for (const s of [-1, 1]) faceBox(sink, 'structureWood', face, s * (vw / 2 + 0.03), vy, 0.02, 0.06, vh, 0.04, c, 'caps');
      faceBox(sink, 'structureWood', face, 0, vy, 0.008, vw, vh, 0.016, { colour: shade(finish.trim, 0.35), decor: true });
      for (let k = 0; k < 4; k++) {
        faceBox(sink, 'structureWood', face, 0, vy - vh / 2 + (k + 0.5) * vh / 4, 0.026, vw, 0.03, 0.02, { colour: shade(finish.trim, 0.9), decor: true, fine: true }, 'ends');
      }
    }
  }
  // the furnace's flue through the roof (a galvanised pipe and its cap) where the house has no stack
  if (!h.chimney) {
    const fx = rg.s * 0.45, fz = h.D * 0.08, y = rg.topAt(fx, fz);
    if (y !== null) {
      sink.cylinder('structureMetal', [fx, y - 0.1, fz], 'y', 0.75, 0.07, 8, { colour: GALV, decor: true });
      sink.cylinder('structureMetal', [fx, y + 0.65, fz], 'y', 0.12, 0.15, 8, { colour: shade(GALV, 0.85), decor: true }, 0.05);
    }
  }
  // the television mast at the ridge, toward the front
  if (f() < 0.7) tvAerial(sink, frame, h.D * 0.2, f);
  const front = frame.faces.front, out = plinth.out + 0.01;
  const onPlinth: Face = { ...front, origin: facePoint(front, 0, 0, out) };
  // the porch light by the door, on its latch side
  wallLantern(sink, front, h.du + 0.475 + 0.28, frame.floors[0] + 1.75);
  // the block planter under the picture window, its shrubs (a hand under the sill's nose)
  const pw = ops.find((o) => o.face === 'front' && o.kind === 'window');
  if (pw && f() < 0.65) {
    // (its foot sunk with the plinth's, its top a hand over the floor and well under the sill's nose)
    const pu = pw.u, pl = pw.w + 0.3;
    const lo = -0.6, top = frame.floors[0] + 0.2;
    if (top < frame.floors[0] + pw.y0 - 0.2) {
      faceBox(sink, BLOCK, onPlinth, pu, (lo + top) / 2, 0.25, pl, top - lo, 0.5, { decor: true });
      const green: Rgb = [0.16, 0.26, 0.12];
      for (let k = 0; k < 3; k++) {
        const c = facePoint(onPlinth, pu + (k - 1) * pl * 0.3, top, 0.25);
        mound(sink, c, onPlinth.u, onPlinth.out, 0.28, 0.17, 0.32 + f() * 0.12, shade(green, 0.9 + f() * 0.2), { decor: true }, k);
      }
    }
  }
  // the oleanders at the front's corners clear of the openings and the porch's posts: a clump of three leafy stems'
  // mounds standing on the ground side by side, the tallest flecked with the bloom
  const bloom = pick(f, OLEANDER), leaf: Rgb = [0.13, 0.24, 0.1];
  const clear = (u: number) => ops.every((o) => o.face !== 'front' || Math.abs(o.u - u) > o.w / 2 + (o.kind === 'door' ? 1.1 : 0.7));
  for (const u of [frame.faces.front.width / 2 - 0.55, -(frame.faces.front.width / 2 - 0.55)]) {
    if (!clear(u) || f() < 0.35 || (u > 0 && h.carport)) continue;
    const size = 1.0 + f() * 0.35, tone = 0.85 + f() * 0.25;
    for (const [du, k, tall] of [[-0.3, 0.62, 0.8], [0.28, 0.66, 0.88], [0, 0.72, 1.12]] as const) {
      const c = facePoint(onPlinth, u + du * size, -0.05, size * 0.4);
      const tint: Rgb = tall > 1 ? [leaf[0] * 0.8 + bloom[0] * tone * 0.2, leaf[1] * 0.8 + bloom[1] * tone * 0.2, leaf[2] * 0.8 + bloom[2] * tone * 0.2] : shade(leaf, 0.85 + f() * 0.25);
      mound(sink, c, onPlinth.u, onPlinth.out, size * k * 0.62, size * k * 0.5, size * tall, tint, { decor: true }, u + du);
    }
  }
}
