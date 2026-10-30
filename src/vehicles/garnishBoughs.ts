// src/vehicles/garnishBoughs.ts — the cut boughs a crew tucks into a camouflage net, painted per species for the
// ghillie garnish atlas (vehicleFoliage.ts ghillieGarnishAtlasSteps, its tiles GARNISH_BOUGH_TILES).
//
// The ghillie render lane (263, 2026-10-28; the GPU-still critic on the Christian II and the Strv 121: "the garnish
// leaves do not read as the stated species (beech garnish, spruce boughs); the cards look generic"). The bough tiles
// were the trees' spray tiles (treeSprayAtlas.ts): a crown's leaf cluster painted to read at 30 m, a beech's 8 cm leaves
// crowded on a 0.75 m card, a spruce a dark blur with light blocks for tips. On a vehicle a bough is seen at a few
// metres, a cut branch on a 0.45-0.9 m card, so each species is painted here as that branch at its own leaf size and
// habit: beech in level two-ranked sprays of glossy ovals on a zigzag twig, each leaf with its straight parallel veins
// and wavy edge; oak lobed and crowded at the shoot tips; birch in small toothed triangles on a white-barked cut;
// holm oak small and dark with felted grey undersides; olive narrow and silver in opposite pairs; spruce a fishbone
// frond of bottle-brush shoots, short stiff needles all round each and the season's pale growth at the tips; fir its
// flat two-ranked needles; pine long needles in tufts at the shoot ends.
//
// A bough card is BOUGH_CARD_ASPECT of its length wide, so the tile is drawn in card units (across ±aspect/2, along 0 at
// the stem to 1 at the tip) stretched over the square tile, which the card squeezes back: a leaf's shape and a needle's
// angle are true on the card. Everything stays inside the atlas's elliptical tile falloff (vehicleFoliage.ts), the
// stem's foot at the tile's bottom centre as the cards seat it.
import type { SprayKind } from '../world/treeSprayAtlas.ts';

type Rng = () => number;
type Pt = readonly [number, number];
type Hsl = readonly [number, number, number];

/** A field bough card's width over its length (ghillieSuit.ts addFieldTufts): the tile is drawn at this aspect. */
const BOUGH_CARD_ASPECT = 0.58;
/** Card units per canvas unit along and across (cardSpace's scale, inverse): the line widths' sense of a pixel. */
const ALONG = 0.95, ACROSS = 0.98;

const hsla = ([h, s, l]: Hsl, a = 1, dl = 0): string =>
  `hsla(${h.toFixed(1)},${s.toFixed(1)}%,${Math.max(0, Math.min(100, l + dl)).toFixed(1)}%,${a})`;

/** Draw in card units: x across, y along from the stem foot (0) toward the tip (1). */
function cardSpace(ctx: CanvasRenderingContext2D, S: number): void {
  ctx.translate(S / 2, S * 0.975);
  ctx.scale((S / BOUGH_CARD_ASPECT) * ACROSS, -S * ALONG);
}

/** Whether a card point lies inside the tile's opaque ellipse (vehicleFoliage.ts finishGarnishTiles), `margin` in. */
function inTile(x: number, y: number, margin = 0): boolean {
  const ex = (x * 2 * ACROSS) / BOUGH_CARD_ASPECT, ey = (0.975 - ALONG * y) * 2 - 1;
  return Math.hypot(ex, ey * 0.98) < 0.84 - margin;
}

/** The farthest a shoot from (x, y) along unit (dx, dy) may reach and stay inside the tile, up to `want`. */
function reach(x: number, y: number, dx: number, dy: number, want: number, margin = 0.04): number {
  let len = 0;
  for (let s = 0.01; s <= want; s += 0.01) { if (!inTile(x + dx * s, y + dy * s, margin)) break; len = s; }
  return len;
}

/** A shoot: a gently bent polyline from `p0` at `angle` (radians from +y toward +x), `bend` turning it along its length. */
function shoot(p0: Pt, angle: number, length: number, bend: number, steps = 10): Pt[] {
  const pts: Pt[] = [p0];
  let [x, y] = p0, a = angle;
  for (let k = 0; k < steps; k++) {
    a += bend / steps;
    x += Math.sin(a) * (length / steps);
    y += Math.cos(a) * (length / steps);
    pts.push([x, y]);
  }
  return pts;
}

/** The point and unit direction a share `t` along a polyline. */
function along(pts: readonly Pt[], t: number): { p: Pt; d: Pt } {
  const f = Math.max(0, Math.min(0.9999, t)) * (pts.length - 1), i = Math.floor(f), u = f - i;
  const a = pts[i], b = pts[i + 1];
  const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
  return { p: [a[0] + dx * u, a[1] + dy * u], d: [dx / l, dy / l] };
}

/** A woody stem, tapering from w0 to w1, a lit edge along one side. */
function wood(ctx: CanvasRenderingContext2D, pts: readonly Pt[], w0: number, w1: number, tone: Hsl): void {
  ctx.lineCap = 'round';
  for (let k = 0; k + 1 < pts.length; k++) {
    const w = w0 + (w1 - w0) * (k / (pts.length - 1));
    ctx.strokeStyle = hsla(tone);
    ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(pts[k][0], pts[k][1]); ctx.lineTo(pts[k + 1][0], pts[k + 1][1]); ctx.stroke();
    ctx.strokeStyle = hsla(tone, 0.55, 12);
    ctx.lineWidth = w * 0.35;
    ctx.beginPath(); ctx.moveTo(pts[k][0] - w * 0.2, pts[k][1]); ctx.lineTo(pts[k + 1][0] - w * 0.2, pts[k + 1][1]); ctx.stroke();
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Broadleaf boughs
// ---------------------------------------------------------------------------------------------------------------

type LeafShape = 'beech' | 'oak' | 'birch' | 'holm' | 'lance';

interface LeafHabit {
  readonly shape: LeafShape;
  /** Leaf length, card units (a bough card is 0.45-0.9 m long). */
  readonly len: readonly [number, number];
  /** Leaf half-width over its length. */
  readonly aspect: number;
  /** Leaves a side twig carries, and the twigs' count. */
  readonly spacing: number;
  readonly twigs: readonly [number, number];
  /** Leaf angle off its twig (radians). */
  readonly angle: number;
  /** Two leaves at a node (olive) instead of one, alternate. */
  readonly opposite?: boolean;
  /** Leaves crowd toward the shoot tips (oak). */
  readonly crowdTips?: boolean;
  /** Lateral vein pairs drawn (0: none). */
  readonly veins: number;
  readonly upper: Hsl;
  readonly under: Hsl;
  readonly underShare: number;
  /** A sheen along the leaf's lit half (0..1). */
  readonly gloss: number;
  readonly bark: Hsl;
  /** A white-barked cut stem (birch). */
  readonly whiteBark?: boolean;
}

const LEAF_HABITS: Readonly<Partial<Record<SprayKind, LeafHabit>>> = Object.freeze({
  beech: { shape: 'beech', len: [0.095, 0.13], aspect: 0.32, spacing: 0.048, twigs: [6, 8], angle: 0.95, veins: 7,
    upper: [92, 42, 34], under: [84, 26, 50], underShare: 0.16, gloss: 0.5, bark: [28, 14, 34] },
  oak: { shape: 'oak', len: [0.1, 0.14], aspect: 0.3, spacing: 0.035, twigs: [3, 5], angle: 0.7, crowdTips: true, veins: 0,
    upper: [80, 40, 25], under: [72, 24, 40], underShare: 0.12, gloss: 0.15, bark: [26, 18, 28] },
  birch: { shape: 'birch', len: [0.06, 0.085], aspect: 0.36, spacing: 0.045, twigs: [5, 7], angle: 1.0, veins: 5,
    upper: [78, 48, 35], under: [72, 30, 48], underShare: 0.14, gloss: 0.3, bark: [32, 16, 30], whiteBark: true },
  holmOak: { shape: 'holm', len: [0.05, 0.07], aspect: 0.3, spacing: 0.03, twigs: [5, 7], angle: 0.85, veins: 0,
    upper: [98, 32, 19], under: [70, 10, 52], underShare: 0.3, gloss: 0.6, bark: [24, 12, 26] },
  olive: { shape: 'lance', len: [0.08, 0.11], aspect: 0.11, spacing: 0.04, twigs: [5, 7], angle: 0.55, opposite: true, veins: 0,
    upper: [84, 18, 33], under: [70, 12, 58], underShare: 0.35, gloss: 0.2, bark: [30, 12, 34] },
});

/** A leaf's half-width at a share t from base to tip (before its margin's teeth or waves). */
function leafWidth(shape: LeafShape, t: number): number {
  switch (shape) {
    case 'beech': return Math.pow(Math.sin(Math.PI * Math.pow(t, 0.82)), 0.85) * (1 - 0.25 * t * t);
    case 'oak': return (0.35 + 0.65 * Math.sin(Math.PI * Math.pow(t, 0.7))) * (t < 0.08 ? t / 0.08 : 1);
    case 'birch': return t < 0.28 ? Math.sin((t / 0.28) * Math.PI / 2) : Math.pow(1 - (t - 0.28) / 0.72, 0.9);
    case 'holm': return Math.pow(Math.sin(Math.PI * t), 0.75);
    case 'lance': return Math.pow(Math.sin(Math.PI * t), 1.1);
  }
}

/** One side's margin of a leaf in its own frame (base at the origin, tip at (0, len)), base to tip. */
function leafMargin(h: LeafHabit, len: number, side: number, rng: Rng): Pt[] {
  const n = 28, pts: Pt[] = [];
  const wid = len * h.aspect;
  const lobes = 3 + Math.floor(rng() * 2);
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    let w = leafWidth(h.shape, t) * wid;
    if (h.shape === 'oak') w *= 0.55 + 0.45 * Math.abs(Math.sin(t * lobes * Math.PI + 0.3));
    else if (h.shape === 'beech') w *= 1 + 0.06 * Math.sin(t * h.veins * Math.PI * 2);
    else if (h.shape === 'birch') w *= 1 + (k % 2 ? -0.09 : 0.05) + (k % 4 === 1 ? -0.05 : 0);
    else if (h.shape === 'holm' && k % 7 === 3) w *= 1.12;
    pts.push([side * w, t * len]);
  }
  return pts;
}

/** Paint one leaf: its cast shade on what lies under it, the blade shaded across its fold, its veins and its edge. */
function paintLeaf(ctx: CanvasRenderingContext2D, h: LeafHabit, base: Pt, angle: number, len: number, rng: Rng): void {
  const under = rng() < h.underShare;
  const tone: Hsl = under ? h.under : [h.upper[0] + (rng() - 0.5) * 14, h.upper[1] + (rng() - 0.5) * 12, h.upper[2] + (rng() - 0.5) * 10];
  const left = leafMargin(h, len, -1, rng), right = leafMargin(h, len, 1, rng);
  const petiole = len * 0.12;
  ctx.save();
  ctx.translate(base[0], base[1]);
  ctx.rotate(-angle);
  const outline = (): void => {
    ctx.beginPath();
    ctx.moveTo(0, petiole);
    for (const [x, y] of left) ctx.lineTo(x, y + petiole);
    for (let k = right.length - 1; k >= 0; k--) ctx.lineTo(right[k][0], right[k][1] + petiole);
    ctx.closePath();
  };
  // the shade it casts on the leaves and twig under it, only where they are (source-atop: no dark texel round the
  // bough that the cut would hide and the filter and mips would smear into its edge)
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.translate(0.006, -0.009);
  outline();
  ctx.fillStyle = 'rgba(12,16,8,0.32)';
  ctx.fill();
  ctx.restore();
  // the petiole
  ctx.strokeStyle = hsla(h.bark, 1, 6);
  ctx.lineWidth = 0.004;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, petiole + len * 0.05); ctx.stroke();
  // the blade, lit on one half of its fold, shaded on the other, a sheen near the midrib
  outline();
  const wid = len * h.aspect;
  const lit = rng() < 0.5 ? 1 : -1;
  const g = ctx.createLinearGradient(-wid * lit, 0, wid * lit, 0);
  g.addColorStop(0, hsla(tone, 1, -7));
  g.addColorStop(0.46, hsla(tone, 1, -2));
  g.addColorStop(0.54, hsla(tone, 1, 3 + h.gloss * 6));
  g.addColorStop(1, hsla(tone, 1, 1));
  ctx.fillStyle = g;
  ctx.fill();
  // darker toward the base where the blade cups, lighter toward the tip
  const v = ctx.createLinearGradient(0, petiole, 0, petiole + len);
  v.addColorStop(0, 'rgba(10,14,6,0.22)');
  v.addColorStop(0.45, 'rgba(10,14,6,0)');
  v.addColorStop(1, `rgba(255,255,230,${(0.05 + h.gloss * 0.06).toFixed(3)})`);
  ctx.fillStyle = v;
  ctx.fill();
  // the midrib and the lateral veins (straight and parallel on a beech, finer on a birch)
  const vein = hsla(tone, under ? 0.6 : 0.42, under ? 12 : 9);
  ctx.strokeStyle = vein;
  ctx.lineWidth = 0.0032;
  ctx.beginPath(); ctx.moveTo(0, petiole); ctx.lineTo(0, petiole + len * 0.94); ctx.stroke();
  if (h.veins > 0) {
    ctx.lineWidth = 0.0018;
    ctx.beginPath();
    for (let k = 1; k <= h.veins; k++) {
      const t = 0.1 + (k / (h.veins + 1)) * 0.82;
      const w = leafWidth(h.shape, Math.min(1, t + 0.1)) * wid * 0.92;
      for (const s of [-1, 1]) {
        ctx.moveTo(0, petiole + t * len);
        ctx.lineTo(s * w, petiole + (t + 0.12) * len);
      }
    }
    ctx.stroke();
  }
  // the blade's edge, a shade darker, inside it only
  ctx.globalCompositeOperation = 'source-atop';
  outline();
  ctx.strokeStyle = hsla(tone, 0.5, -10);
  ctx.lineWidth = 0.0044;
  ctx.stroke();
  ctx.restore();
}

function paintBroadleafBough(ctx: CanvasRenderingContext2D, rng: Rng, h: LeafHabit): void {
  // the cut stem and the main shoot, kinked at every node (a beech's zigzag), toward the tip
  const tipX = (rng() - 0.5) * 0.05;
  const main: Pt[] = [[0, -0.03]];
  const nodes = 9;
  for (let k = 1; k <= nodes; k++) {
    const t = k / nodes;
    main.push([tipX * t + (k % 2 ? 1 : -1) * 0.008 * (1 - t * 0.5), -0.03 + t * 0.9]);
  }
  const twigs: Array<{ pts: Pt[]; tipShare: number }> = [];
  const nTwigs = h.twigs[0] + Math.floor(rng() * (h.twigs[1] - h.twigs[0] + 1));
  for (let k = 0; k < nTwigs; k++) {
    const t = 0.14 + (k / Math.max(1, nTwigs - 1)) * 0.56 + (rng() - 0.5) * 0.05;
    const side = k % 2 ? 1 : -1;
    const at = along(main, t);
    const a = side * (0.62 + rng() * 0.38);
    const want = 0.2 + rng() * 0.16;
    const len = reach(at.p[0], at.p[1], Math.sin(a), Math.cos(a), want, 0.1);
    if (len < 0.08) continue;
    twigs.push({ pts: shoot(at.p, a, len, -side * (0.15 + rng() * 0.3), 8), tipShare: 0 });
  }
  wood(ctx, main, h.whiteBark ? 0.024 : 0.016, 0.004, h.whiteBark ? [40, 8, 82] : h.bark);
  if (h.whiteBark) {
    // a birch's cut: white bark with dark lenticels across it
    ctx.strokeStyle = 'rgba(40,36,30,0.7)';
    ctx.lineWidth = 0.003;
    ctx.beginPath();
    for (let y = 0.0; y < 0.28; y += 0.035 + rng() * 0.03) { ctx.moveTo(-0.008, y); ctx.lineTo(0.004 + rng() * 0.004, y + 0.004); }
    ctx.stroke();
  }
  for (const twig of twigs) wood(ctx, twig.pts, 0.007, 0.0025, h.bark);
  // the leaves: along each twig and the main shoot's upper part, alternate (or in opposite pairs), the last ones smaller
  type Leaf = { base: Pt; angle: number; len: number; order: number };
  const leaves: Leaf[] = [];
  const dress = (pts: readonly Pt[], from: number): void => {
    let length = 0;
    for (let k = 1; k < pts.length; k++) length += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
    const count = Math.max(2, Math.round((length * (1 - from)) / h.spacing));
    for (let k = 0; k < count; k++) {
      let t = from + ((k + 0.5) / count) * (1 - from);
      if (h.crowdTips) t = 1 - Math.pow(1 - t, 2.2) * (1 - from);
      const at = along(pts, t);
      const dirA = Math.atan2(at.d[0], at.d[1]);
      for (const side of h.opposite ? [-1, 1] : [k % 2 ? 1 : -1]) {
        const tipward = t > 0.86 ? 0.75 : 1;
        const len = (h.len[0] + rng() * (h.len[1] - h.len[0])) * tipward;
        const angle = dirA + side * (h.angle * (0.75 + rng() * 0.5)) * (t > 0.92 ? 0.4 : 1);
        const tip: Pt = [at.p[0] + Math.sin(angle) * len, at.p[1] + Math.cos(angle) * len];
        const mid: Pt = [at.p[0] + Math.sin(angle) * len * 0.5, at.p[1] + Math.cos(angle) * len * 0.5];
        if (!inTile(tip[0], tip[1], 0.03) || !inTile(mid[0], mid[1], 0.06)) continue;
        leaves.push({ base: at.p, angle, len, order: rng() });
      }
    }
  };
  for (const twig of twigs) dress(twig.pts, 0.12);
  dress(main, 0.5);
  // back to front in a loose order: later leaves lie over earlier ones
  leaves.sort((a, b) => a.order - b.order);
  for (const leaf of leaves) paintLeaf(ctx, h, leaf.base, leaf.angle, leaf.len, rng);
}

// ---------------------------------------------------------------------------------------------------------------
// Conifer boughs
// ---------------------------------------------------------------------------------------------------------------

interface NeedleHabit {
  /** Needle length (card units) and the angle a needle leaves its shoot (radians). */
  readonly len: readonly [number, number];
  readonly angle: readonly [number, number];
  /** Needles also cover the shoot's top (all round, a spruce) or lie in two flat ranks (a fir). */
  readonly allRound: boolean;
  /** Needle spacing along a shoot. */
  readonly step: number;
  /** Lateral pairs along the axis, their longest reach and their droop. */
  readonly laterals: number;
  readonly lateralLen: number;
  readonly droop: number;
  /** Deep, mid, light needle tones and the season's fresh growth at the tips. */
  readonly deep: Hsl;
  readonly mid: Hsl;
  readonly light: Hsl;
  readonly fresh: Hsl;
  /** A fir's pale stripes under its needles (the light rank). */
  readonly pale?: Hsl;
  readonly bark: Hsl;
}

const NEEDLE_HABITS: Readonly<Partial<Record<SprayKind, NeedleHabit>>> = Object.freeze({
  spruce: { len: [0.02, 0.03], angle: [0.85, 1.15], allRound: true, step: 0.0062, laterals: 8, lateralLen: 0.3, droop: 0.35,
    deep: [150, 30, 12], mid: [146, 30, 18], light: [138, 28, 25], fresh: [96, 40, 34], bark: [24, 40, 30] },
  fir: { len: [0.028, 0.038], angle: [1.2, 1.45], allRound: false, step: 0.0068, laterals: 7, lateralLen: 0.3, droop: 0.15,
    deep: [140, 34, 13], mid: [136, 34, 19], light: [130, 30, 26], fresh: [100, 40, 36], pale: [150, 16, 62], bark: [26, 30, 28] },
});

function paintNeedleBough(ctx: CanvasRenderingContext2D, rng: Rng, h: NeedleHabit, needleWidth = 1): void {
  // the axis and its laterals in pairs, longest a third of the way up (the frond's outline), drooping at their ends
  const axis = shoot([0, -0.03], (rng() - 0.5) * 0.08, 0.95, (rng() - 0.5) * 0.12, 12);
  const shoots: Array<{ pts: Pt[]; terminal: boolean; scale: number }> = [{ pts: axis, terminal: true, scale: 1 }];
  for (let k = 0; k < h.laterals; k++) {
    const t = 0.1 + (k / h.laterals) * 0.8 + (rng() - 0.5) * 0.03;
    const at = along(axis, t);
    for (const side of [-1, 1]) {
      const a = Math.atan2(at.d[0], at.d[1]) + side * (0.78 + rng() * 0.22);
      const want = h.lateralLen * (1 - Math.abs(t - 0.36) * 1.05) * (0.8 + rng() * 0.35);
      const len = reach(at.p[0], at.p[1], Math.sin(a), Math.cos(a), want, 0.07);
      if (len < 0.04) continue;
      const lateral = shoot(at.p, a, len, side * h.droop * (0.6 + rng() * 0.7), 8);
      shoots.push({ pts: lateral, terminal: true, scale: 0.92 });
      // a secondary shoot or two off the lateral, toward the tip
      for (const s of [0.35, 0.65]) {
        if (len < 0.12 || rng() < 0.35) continue;
        const sec = along(lateral, s);
        const sa = Math.atan2(sec.d[0], sec.d[1]) + (rng() < 0.5 ? -1 : 1) * (0.6 + rng() * 0.3);
        const sl = reach(sec.p[0], sec.p[1], Math.sin(sa), Math.cos(sa), len * (0.3 + rng() * 0.15), 0.06);
        if (sl > 0.03) shoots.push({ pts: shoot(sec.p, sa, sl, (rng() - 0.5) * 0.3, 5), terminal: true, scale: 0.8 });
      }
    }
  }
  for (const s of shoots) wood(ctx, s.pts, s === shoots[0] ? 0.012 : 0.006, 0.002, h.bark);
  // the needles, binned by tone (one path a tone): the deep inner ones first, the fresh tips last, over the rest
  const bins = { deep: new Path2D(), mid: new Path2D(), light: new Path2D(), pale: new Path2D(), fresh: new Path2D() };
  for (const s of shoots) {
    let length = 0;
    for (let k = 1; k < s.pts.length; k++) length += Math.hypot(s.pts[k][0] - s.pts[k - 1][0], s.pts[k][1] - s.pts[k - 1][1]);
    const n = Math.max(4, Math.round(length / h.step));
    for (let k = 0; k < n; k++) {
      const t = (k + rng() * 0.6) / n;
      const at = along(s.pts, t);
      const dir = Math.atan2(at.d[0], at.d[1]);
      const fresh = s.terminal && t > 0.8;
      const taper = (t > 0.88 ? 0.6 + (1 - t) * 3.3 : 1) * s.scale;
      const ranks = h.allRound ? [-1, 1, 0] : [-1, 1];
      for (const side of ranks) {
        const len = (h.len[0] + rng() * (h.len[1] - h.len[0])) * taper * (side === 0 ? 0.7 : 1);
        const a = dir + (side === 0 ? (rng() - 0.5) * 0.5 : side * (h.angle[0] + rng() * (h.angle[1] - h.angle[0])));
        const x1 = at.p[0] + Math.sin(a) * len, y1 = at.p[1] + Math.cos(a) * len;
        if (!inTile(x1, y1, 0.0)) continue;
        const r = rng();
        const bin = fresh ? bins.fresh : side === 0 ? (r < 0.5 ? bins.mid : bins.light)
          : h.pale && side > 0 && r < 0.3 ? bins.pale : r < 0.4 ? bins.deep : r < 0.78 ? bins.mid : bins.light;
        bin.moveTo(at.p[0], at.p[1]);
        bin.lineTo(x1, y1);
      }
    }
  }
  ctx.lineCap = 'round';
  const draw = (path: Path2D, tone: Hsl, width: number): void => {
    ctx.strokeStyle = hsla(tone);
    ctx.lineWidth = width;
    ctx.stroke(path);
  };
  draw(bins.deep, h.deep, 0.0052 * needleWidth);
  draw(bins.mid, h.mid, 0.0048 * needleWidth);
  if (h.pale) draw(bins.pale, h.pale, 0.0046 * needleWidth);
  draw(bins.light, h.light, 0.0044 * needleWidth);
  draw(bins.fresh, h.fresh, 0.0046 * needleWidth);
}

/** A pine's bough: a few bare shoots, each ending in a tuft of long needles. */
function paintTuftBough(ctx: CanvasRenderingContext2D, rng: Rng, tone: Hsl): void {
  const bark: Hsl = [24, 30, 32];
  const axis = shoot([0, -0.03], (rng() - 0.5) * 0.1, 0.6, (rng() - 0.5) * 0.2, 8);
  const shoots: Pt[][] = [axis];
  for (let k = 0; k < 4; k++) {
    const at = along(axis, 0.3 + k * 0.17);
    const side = k % 2 ? 1 : -1;
    const a = Math.atan2(at.d[0], at.d[1]) + side * (0.55 + rng() * 0.3);
    const len = reach(at.p[0], at.p[1], Math.sin(a), Math.cos(a), 0.2 + rng() * 0.08, 0.2);
    if (len > 0.05) shoots.push(shoot(at.p, a, len, side * 0.2, 6));
  }
  for (const s of shoots) wood(ctx, s, s === axis ? 0.014 : 0.008, 0.005, bark);
  ctx.lineCap = 'round';
  for (const s of shoots) {
    const end = along(s, 1);
    const dir = Math.atan2(end.d[0], end.d[1]);
    for (let layer = 0; layer < 3; layer++) {
      ctx.strokeStyle = hsla(tone, 1, -8 + layer * 7);
      ctx.lineWidth = 0.004;
      ctx.beginPath();
      for (let k = 0; k < 26; k++) {
        const from = along(s, 0.7 + rng() * 0.3).p;
        const a = dir + (rng() - 0.5) * 2.6;
        const len = 0.06 + rng() * 0.06;
        let mx = from[0] + Math.sin(a) * len * 0.5, my = from[1] + Math.cos(a) * len * 0.5;
        let x1 = from[0] + Math.sin(a + 0.15) * len, y1 = from[1] + Math.cos(a + 0.15) * len;
        if (!inTile(x1, y1, 0)) { x1 = (from[0] + x1) / 2; y1 = (from[1] + y1) / 2; mx = (from[0] + x1) / 2; my = (from[1] + y1) / 2; }
        ctx.moveTo(from[0], from[1]);
        ctx.quadraticCurveTo(mx, my, x1, y1);
      }
      ctx.stroke();
    }
  }
}

const TUFT_TONES: Readonly<Partial<Record<SprayKind, Hsl>>> = Object.freeze({
  pine: [96, 34, 28], canaryPine: [84, 40, 32], aleppoPine: [90, 22, 38],
});

/**
 * Paint one cut bough of `species` into the tile at the context's origin (S texels a side, transparent where nothing
 * lies; the stem's foot at the tile's bottom centre). Returns false for a species without a garnish habit. `sprig`: the
 * card is that many times shorter than a bough's (a fitted cover's tuft, ghillieSuit.ts addTufts): its leaves and
 * needles are drawn that much larger on the tile and its shoots fewer, so they keep their real size on the card.
 */
export function paintGarnishBough(ctx: CanvasRenderingContext2D, S: number, rng: Rng, species: SprayKind, sprig = 1): boolean {
  const leaf = LEAF_HABITS[species], needle = NEEDLE_HABITS[species], tuft = TUFT_TONES[species];
  if (!leaf && !needle && !tuft) return false;
  const fewer = (n: number): number => Math.max(2, Math.round(n / sprig));
  ctx.save();
  cardSpace(ctx, S);
  if (leaf) {
    paintBroadleafBough(ctx, rng, sprig === 1 ? leaf : { ...leaf, len: [leaf.len[0] * sprig, leaf.len[1] * sprig],
      spacing: leaf.spacing * sprig, twigs: [fewer(leaf.twigs[0]), fewer(leaf.twigs[1])] });
  } else if (needle) {
    // a sprig's card is brightened as a cover's tuft (addTufts' fitted tint): its needles are painted a step darker and
    // its new growth olive, so the shoot reads as the conifer's own dark blue-green, not lime
    const darker = (c: Hsl): Hsl => [c[0], c[1], c[2] * 0.8];
    paintNeedleBough(ctx, rng, sprig === 1 ? needle : { ...needle, len: [needle.len[0] * sprig, needle.len[1] * sprig],
      step: needle.step * sprig, laterals: Math.max(3, fewer(needle.laterals)), deep: darker(needle.deep), mid: darker(needle.mid),
      light: darker(needle.light), fresh: [needle.fresh[0] + 24, needle.fresh[1] * 0.75, needle.fresh[2] * 0.72] }, sprig);
  } else if (tuft) paintTuftBough(ctx, rng, tuft);
  ctx.restore();
  return true;
}
