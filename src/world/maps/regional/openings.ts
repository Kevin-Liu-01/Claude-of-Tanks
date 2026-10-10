// src/world/maps/regional/openings.ts — window, door, gate and step units shared by the regional dialects
// (regional-buildings lane, 2026-10-03). Every unit is dressing (no collision) except where noted; panes go to the
// glass bucket (dark interior at night) or the curtain bucket (a warm lit window at night, marked on its outward face).
import { faceBox, facePanel, facePoint, shade, type Face, type PartSink, type RegionalBucket, type Rgb, type Vec3, UV_MEMBER, UV_WORLD } from './geometry.ts';
import { facadeOn, facadeRng, faceSlab, nalichnikApron, nalichnikCrest, windowHead, type CrestStyle, type HeadStyle } from './facade.ts';

export interface WindowStyle {
  /** frame colour (painted joinery, structureWood) */
  frame: Rgb;
  frameWidth: number;
  frameOut: number;
  /** glazing bars: 'cross' (one mullion + one transom), 'six' (two-by-three lights), 'none' */
  bars: 'cross' | 'six' | 'two' | 'none';
  /** dressed surround in a masonry bucket (stone / plaster) and its width and projection, or null */
  surround: { bucket: RegionalBucket; width: number; out: number; lintel?: number; colour?: Rgb } | null;
  /** the sill */
  sill: { bucket: RegionalBucket; out: number; colour?: Rgb } | null;
  /**
   * shutters: colour and kind, or null; `paint` (facade.ts, desktop builds) paints a border round each leaf and a motif
   * on it in a second colour (the painted shutters of a Russian or Ukrainian village)
   */
  shutters: { colour: Rgb; kind: 'louvred' | 'plank' | 'panel'; closed?: number; paint?: { border: Rgb; motif: 'diamond' | 'heart' | null } } | null;
  /**
   * a carved surround (facade.ts, desktop builds): the surround's plain lintel becomes a cornice ledge and a crest
   * board, its jambs run down past the sill to an apron cut to a drop (the Russian nalichnik)
   */
  carved?: { crest: CrestStyle; apronDrop: number } | null;
  /**
   * a dressed head over the opening (facade.ts, desktop builds): a segmental arch, a hood, a pediment or a lintel. With
   * a surround it takes the place of the surround's flat lintel and spans the surround; without one it spans the opening
   */
  head?: HeadStyle | null;
}

/**
 * The wall a window's sill shadows (the facade craft's round 6; wave 241: "flat panes", "a sill shadow"): house.ts names
 * the rendered or masonry wall it is cutting the openings of; a framed wall names none (its breast rail lies under the
 * sill). Builders are synchronous: the slot never leaks between walls.
 */
let sillShadowBucket: RegionalBucket | null = null;
export function withSillShadow<T>(bucket: RegionalBucket | null, body: () => T): T {
  const prior = sillShadowBucket;
  sillShadowBucket = bucket;
  try { return body(); } finally { sillShadowBucket = prior; }
}

/**
 * The shadow a sill's nose lays on the wall under it: a band the sill's width and about its projection deep, darkest
 * against the sill, 12 mm proud of the wall (the panel washes' depth: resolved to ~250 m), in the wall's own bucket so the
 * weathering pass gives it the wall's tone, texture and damp. Desktop craft only (dressing).
 */
function sillShadow(sink: PartSink, bucket: RegionalBucket, face: Face, u: number, yTop: number, width: number, out: number): void {
  const deep = Math.min(0.16, 0.05 + out * 0.8), half = width / 2;
  const at = (p: Vec3) => (p[1] > yTop - 0.01 ? 0.68 : 1);
  sink.quad(bucket, facePoint(face, u - half + 0.03, yTop - deep, 0.012), facePoint(face, u + half - 0.03, yTop - deep, 0.012),
    facePoint(face, u + half, yTop, 0.012), facePoint(face, u - half, yTop, 0.012), { decor: true, shadeAt: at });
}

/** Choose the pane bucket: about `litShare` of windows show a lit curtain at night. */
export function paneBucket(rng: () => number, litShare: number): 'glass' | 'curtain' {
  return rng() < litShare ? 'curtain' : 'glass';
}

/**
 * One window: pane, frame and bars, surround, sill, shutters. (u, y) is the bottom-centre of the clear opening. In a
 * wall the house grammar has cut the opening into (sink.recess > 0) the pane and frame stand at the back of the
 * reveal; the surround, the open shutters and the sill's nose stay on the face.
 */
export function windowUnit(sink: PartSink, face: Face, u: number, y: number, w: number, h: number, style: WindowStyle,
  rng: () => number, litShare = 0.4): void {
  const pane = paneBucket(rng, litShare);
  const dec = { decor: true };
  const r = sink.recess, back = r > 0 ? -r : 0;
  const craft = facadeOn();
  if (craft && pane === 'glass') {
    // (the facade craft's round 6; wave 241: "windows that are flat dark-blue panes") old glass never lies true in its
    // frame: each pane leans its own degree or two (the facade stream), so the sky and the street it reflects differ from
    // window to window; it stays between the reveal's back and the glazing bars' faces
    const fr = facadeRng(), lean = (fr() - 0.5) * 0.024, turn = (fr() - 0.5) * 0.016, o = back + 0.02;
    const P = (du: number, dy: number) => facePoint(face, u + du * w / 2, y + h / 2 + dy * h / 2, o + dy * lean + du * turn);
    sink.quad(pane, P(-1, -1), P(1, -1), P(1, 1), P(-1, 1), { ...dec, uv: UV_WORLD });
  } else facePanel(sink, pane, face, u, y + h / 2, r > 0 ? back + 0.012 : 0.018, w, h, { ...dec, window: face.out });
  const F = style.frameWidth, O = style.frameOut;
  // the frame, its glazing bars and the shutters' rails are fine joinery (EmitOptions.fine): drawn near the camera only;
  // (round 6) in a reveal the craft shades the frame the way the reveal's head shades it, darkest under the soffit
  const top = y + h, reach = Math.max(0.3, h * 0.55);
  const fc = { colour: style.frame, decor: true, fine: true,
    ...(craft && r > 0 ? { colourAt: (p: Vec3) => shade(style.frame, 0.7 + 0.3 * Math.min(1, Math.max(0, (top - p[1]) / reach))) } : {}) };
  // frame: jambs, head and bottom rail, standing out of the pane plane; a jamb's foot stands on the sill and its head
  // under the reveal's soffit (or a surround's lintel standing as far out): those caps never show
  const jamb = { bottom: !!style.sill, top: r > 0 || (!!style.surround && style.surround.out >= O) };
  faceBox(sink, 'structureWood', face, u - w / 2 + F / 2, y + h / 2, back + O / 2, F, h, O, fc, jamb);
  faceBox(sink, 'structureWood', face, u + w / 2 - F / 2, y + h / 2, back + O / 2, F, h, O, fc, jamb);
  faceBox(sink, 'structureWood', face, u, y + h - F / 2, back + O / 2, w - 2 * F, F, O, fc, 'ends');
  faceBox(sink, 'structureWood', face, u, y + F / 2, back + O / 2, w - 2 * F, F, O, fc, 'ends');
  const bar = Math.max(0.03, F * 0.55), barO = O * 0.7;
  if (style.bars === 'cross' || style.bars === 'two' || style.bars === 'six') {
    faceBox(sink, 'structureWood', face, u, y + h / 2, back + barO / 2, bar, h - 2 * F, barO, fc, 'caps');
  }
  if (style.bars === 'cross') faceBox(sink, 'structureWood', face, u, y + h * 0.64, back + barO / 2, w - 2 * F, bar, barO, fc, 'ends');
  if (style.bars === 'six') {
    for (const t of [1 / 3, 2 / 3]) faceBox(sink, 'structureWood', face, u, y + h * t, back + barO / 2, w - 2 * F, bar, barO, fc, 'ends');
  }
  const carved = style.surround && style.carved && facadeOn() ? style.carved : null;
  if (style.surround && carved) {
    // the carved surround: jambs from the apron to the head board, the crest over it, the apron under the sill
    const s = style.surround, sw = s.width, so = s.out, outer = w + 2 * sw;
    const sc = { decor: true, fineSides: true, ...(s.colour ? { colour: s.colour } : {}) };
    const foot = y - 0.09 - carved.apronDrop * 0.55, head = y + h;
    faceBox(sink, s.bucket, face, u - w / 2 - sw / 2, (foot + head) / 2, so / 2, sw, head - foot, so, sc);
    faceBox(sink, s.bucket, face, u + w / 2 + sw / 2, (foot + head) / 2, so / 2, sw, head - foot, so, sc);
    nalichnikCrest(sink, face, u, head, outer, carved.crest);
    nalichnikApron(sink, face, u, y - 0.09, outer, carved.apronDrop, carved.crest.colour, carved.crest.field);
  } else if (style.surround) {
    const s = style.surround, sw = s.width, so = s.out, lintel = s.lintel ?? sw;
    // a dressed surround reads by its face at range: its sides and soffits are fine joinery (EmitOptions.fineSides)
    const sc = { decor: true, fineSides: true, ...(s.colour ? { colour: s.colour } : {}) };
    faceBox(sink, s.bucket, face, u - w / 2 - sw / 2, y + h / 2, so / 2, sw, h, so, sc);
    faceBox(sink, s.bucket, face, u + w / 2 + sw / 2, y + h / 2, so / 2, sw, h, so, sc);
    if (style.head && facadeOn()) windowHead(sink, face, u, y + h, w + 2 * sw, style.head);
    else faceBox(sink, s.bucket, face, u, y + h + lintel / 2, so / 2, w + 2 * sw, lintel, so, sc);
  } else if (style.head && facadeOn()) {
    windowHead(sink, face, u, y + h, w, style.head);
  }
  if (style.sill) {
    // the sill runs through the reveal from the frame to its nose past the face
    const so = style.sill.out, sw = w + (style.surround ? 2 * style.surround.width : 0) + 0.1;
    faceBox(sink, style.sill.bucket, face, u, y - 0.045, (so - r) / 2, sw, 0.09, so + r,
      { decor: true, fineSides: true, ...(style.sill.colour ? { colour: style.sill.colour } : {}) });
    if (craft && sillShadowBucket) sillShadow(sink, sillShadowBucket, face, u, y - 0.09, sw, so);
  }
  if (style.shutters) {
    const sh = style.shutters, leaf = w / 2 + 0.03, sideOff = style.surround ? style.surround.width : 0;
    const closed = sh.closed ?? 0;
    // each window's shutters weathered a little differently (repainted one year, sun-faded another)
    const fade = 0.88 + rng() * 0.2;
    const sc = { colour: [sh.colour[0] * fade, sh.colour[1] * fade, sh.colour[2] * fade] as Rgb, decor: true, uv: UV_MEMBER };
    if (rng() < closed) {
      // closed: both leaves across the opening, proud of the frame
      const shut = Math.max(0, O - r);
      faceBox(sink, 'structureWood', face, u - leaf / 2 + 0.015, y + h / 2, shut + 0.025, leaf, h + 0.02, 0.035, sc);
      faceBox(sink, 'structureWood', face, u + leaf / 2 - 0.015, y + h / 2, shut + 0.028, leaf, h + 0.02, 0.035, sc);
    } else {
      for (const side of [-1, 1]) {
        const cu = u + side * (w / 2 + sideOff + leaf / 2 + 0.02);
        // the open leaf folded back flat on the wall (its back face then never shows), its rails on its face
        const T = 0.035, front = T + 0.001, ro = front + 0.01 - 0.002;
        faceBox(sink, 'structureWood', face, cu, y + h / 2, front - T / 2, leaf, h + 0.02, T, { ...sc, fineSides: true });
        if (sh.paint && facadeOn()) paintedLeaf(sink, face, cu, y + h / 2, leaf, h + 0.02, front, sh.paint);
        if (sh.kind === 'louvred') {
          // two rails read the louvre frame; the detail tile's grain carries the slats
          for (const t of [0.06, 0.94]) faceBox(sink, 'structureWood', face, cu, y + h * t, ro, leaf, 0.05, 0.02, { ...sc, fine: true }, { back: true });
        } else if (sh.kind === 'plank') {
          for (const t of [0.18, 0.82]) faceBox(sink, 'structureWood', face, cu, y + h * t, ro, leaf - 0.04, 0.07, 0.02, { ...sc, fine: true }, { back: true });
        }
      }
    }
  }
}

/**
 * A shutter leaf's joinery in a second paint (facade craft; wave 172 read the painted leaves as "flat paint without
 * carved relief"): the stiles and rails a hand wide round its face standing 14 mm proud, and the motif at its middle (a
 * diamond, a heart) an applied panel 10 mm proud, its edges catching the light — near the camera only (EmitOptions.fine
 * 'near'; past that the leaf keeps its own paint).
 */
function paintedLeaf(sink: PartSink, face: Face, u: number, y: number, w: number, h: number, o: number,
  paint: { border: Rgb; motif: 'diamond' | 'heart' | null }): void {
  const b = Math.min(0.06, w * 0.12), c = { colour: paint.border, decor: true, fine: 'near' as const };
  const T = 0.014;
  faceBox(sink, 'structureWood', face, u, y + h / 2 - b / 2, o + T / 2, w, b, T, c, { back: true });
  faceBox(sink, 'structureWood', face, u, y - h / 2 + b / 2, o + T / 2, w, b, T, c, { back: true });
  faceBox(sink, 'structureWood', face, u - w / 2 + b / 2, y, o + T / 2, b, h - 2 * b, T, c, { back: true, top: true, bottom: true });
  faceBox(sink, 'structureWood', face, u + w / 2 - b / 2, y, o + T / 2, b, h - 2 * b, T, c, { back: true, top: true, bottom: true });
  if (paint.motif) {
    const s = Math.min(w, h) * 0.22;
    const P = (du: number, dy: number): [number, number] => [u + du, y + dy];
    if (paint.motif === 'diamond') faceSlab(sink, 'structureWood', face, [P(0, -s), P(s * 0.7, 0), P(0, s), P(-s * 0.7, 0)], o, 0.01, c);
    else {
      // a heart: two lobes over a point
      faceSlab(sink, 'structureWood', face, [P(0, -s), P(s * 0.75, s * 0.25), P(s * 0.4, s * 0.7), P(0, s * 0.35)], o, 0.01, c);
      faceSlab(sink, 'structureWood', face, [P(0, -s), P(0, s * 0.35), P(-s * 0.4, s * 0.7), P(-s * 0.75, s * 0.25)], o, 0.01, c);
    }
  }
}

export interface DoorStyle {
  leaf: Rgb;
  /** frame / surround: a timber frame colour or a masonry surround */
  frame: { bucket: RegionalBucket; width: number; out: number; colour?: Rgb; arch?: boolean; tint?: Rgb };
  /** a glazed transom over the leaf */
  transom?: boolean;
  /** step treads */
  steps: { bucket: RegionalBucket; colour?: Rgb } | null;
  /** panelled (two raised panels) or planked (battens) */
  leafKind: 'panel' | 'plank' | 'glazed';
}

/**
 * A door: leaf recessed in its frame, optional transom and steps up from the ground to the storey floor `floorY`.
 * (u, y) is the bottom-centre of the opening; `ground` is the local ground height under the threshold (0).
 */
export function doorUnit(sink: PartSink, face: Face, u: number, y: number, w: number, h: number, style: DoorStyle, floorY = y): void {
  const leafH = style.transom ? h - 0.42 : h;
  const lc = { colour: style.leaf, decor: true, uv: UV_MEMBER };
  // in a cut opening (sink.recess) the leaf hangs at the back of the reveal
  const r = sink.recess, lo = r > 0 ? -r + 0.022 : 0.012;
  faceBox(sink, 'structureWood', face, u, y + leafH / 2, lo, w, leafH, 0.04, { ...lc, fineSides: true });
  // the leaf's panels and battens are fine joinery (EmitOptions.fine): the leaf itself reads at any range
  if (style.leafKind === 'panel') {
    for (const t of [0.28, 0.72]) faceBox(sink, 'structureWood', face, u, y + leafH * t, lo + 0.028, w * 0.7, leafH * 0.34, 0.02, { ...lc, fine: true });
  } else if (style.leafKind === 'plank') {
    for (const t of [0.15, 0.85]) faceBox(sink, 'structureWood', face, u, y + leafH * t, lo + 0.028, w - 0.08, 0.09, 0.03, { ...lc, fine: true });
  } else {
    faceBox(sink, 'glass', face, u, y + leafH * 0.66, lo + 0.023, w * 0.6, leafH * 0.42, 0.02, { decor: true });
  }
  if (style.transom) {
    faceBox(sink, 'glass', face, u, y + h - 0.21, lo - 0.006, w, 0.36, 0.03, { decor: true });
    faceBox(sink, 'structureWood', face, u, y + leafH + 0.03, lo + 0.028, w, 0.06, 0.06, { colour: style.leaf, decor: true, fine: true });
  }
  const f = style.frame, fw = f.width;
  const fo = { decor: true, fineSides: true, ...(f.colour ? { colour: f.colour } : {}), ...(f.tint ? { tint: f.tint } : {}) };
  faceBox(sink, f.bucket, face, u - w / 2 - fw / 2, y + h / 2, f.out / 2, fw, h, f.out, fo);
  faceBox(sink, f.bucket, face, u + w / 2 + fw / 2, y + h / 2, f.out / 2, fw, h, f.out, fo);
  faceBox(sink, f.bucket, face, u, y + h + fw / 2, f.out / 2, w + 2 * fw, fw, f.out, fo);
  if (f.arch) {
    // a segmental arch read: a keystone and two springers over the head
    faceBox(sink, f.bucket, face, u, y + h + fw + 0.12, f.out / 2 + 0.01, 0.26, 0.24, f.out + 0.02, fo);
    for (const side of [-1, 1]) faceBox(sink, f.bucket, face, u + side * (w / 2 - 0.05), y + h + fw + 0.04, f.out / 2, 0.42, 0.14, f.out, fo);
  }
  if (style.steps && floorY > 0.12) {
    const n = Math.min(6, Math.ceil(floorY / 0.19)), tread = 0.3;
    const sw = w + 2 * fw + 0.3;
    for (let k = 1; k <= n; k++) {
      const top = floorY * (n - k + 1) / n;
      faceBox(sink, style.steps.bucket, face, u, (top - 0.35) / 2, tread * (k - 0.5), sw, top + 0.35, tread,
        { decor: true, ...(style.steps.colour ? { colour: style.steps.colour } : {}) });
    }
  } else if (style.steps) {
    faceBox(sink, style.steps.bucket, face, u, 0.04, 0.18, w + 2 * fw + 0.2, 0.16, 0.36,
      { decor: true, ...(style.steps.colour ? { colour: style.steps.colour } : {}) });
  }
}

/** A double barn gate of planks with battens and a diagonal brace per leaf. */
export function gateUnit(sink: PartSink, face: Face, u: number, y: number, w: number, h: number, leaf: Rgb,
  frame: { bucket: RegionalBucket; width: number; out: number; colour?: Rgb }): void {
  const lc = { colour: leaf, decor: true, uv: UV_MEMBER };
  // in a cut opening (sink.recess) the leaves hang at the back of the reveal
  const r = sink.recess, go = r > 0 ? -r + 0.03 : 0.015;
  for (const side of [-1, 1]) {
    const cu = u + side * w / 4;
    faceBox(sink, 'structureWood', face, cu, y + h / 2, go, w / 2 - 0.02, h, 0.05, lc);
    for (const t of [0.12, 0.5, 0.88]) faceBox(sink, 'structureWood', face, cu, y + h * t, go + 0.035, w / 2 - 0.1, 0.1, 0.03, lc);
  }
  // a wicket door outline in one leaf
  faceBox(sink, 'dark', face, u - w / 4, y + 0.95, go + 0.03, 0.7, 1.75, 0.02, { decor: true });
  const fo = { decor: true, ...(frame.colour ? { colour: frame.colour } : {}) };
  faceBox(sink, frame.bucket, face, u - w / 2 - frame.width / 2, y + h / 2, frame.out / 2, frame.width, h, frame.out, fo);
  faceBox(sink, frame.bucket, face, u + w / 2 + frame.width / 2, y + h / 2, frame.out / 2, frame.width, h, frame.out, fo);
  faceBox(sink, frame.bucket, face, u, y + h + frame.width / 2, frame.out / 2, w + 2 * frame.width, frame.width, frame.out, fo);
}
