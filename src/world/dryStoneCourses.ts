// src/world/dryStoneCourses.ts — how a dry-stone wall's face is laid (the scenery lane, b26).
//
// Gauntlet wave 177 (Saltwind, after b17): the field walls' near form read as "neat stacks of uniform rectangular slabs
// with upright coping … Cotswold or Yorkshire walling rather than suhozid", one run "a jumbled, collapsed pile of flat
// slabs at odd angles with no vertical face", and the mid form's print as "a crazy-paving decal with thick black grout".
// A Dalmatian suhozid is laid from the field's own limestone: chunky, angular lumps of every size, the biggest bedded at
// the foot, each stone set on whatever the stones under it leave — so the courses wander, a tall stone stands into the
// course above, and where a stone's corner is knocked off a dark void stays open between it and its neighbours.
//
// This is that law, once, for every place a face is laid: the field works' stone form (fieldWorks.ts), their mid
// form's face print (fieldWallFace.ts) and the destructible dry-stone module (inhabitKit.ts). A face is laid on a
// skyline — the top of what is laid so far, along the face — course by course: each stone's bed follows the skyline
// under it (its bottom edge sampled at its ends and its middle, so it sits on its neighbours below and no void opens
// under it), its top a little tipped, and a knocked corner now and then (the skyline keeps the corner's uncut line, so
// the stone above beds over it and the void stays open). Pure: no three.js, no DOM; the caller's stream, deterministic.

/** The skyline's resolution along the face (m). */
const SKY_CELL_M = 0.01;

interface DryStoneFaceOptions {
  /** The highest a stone stands at each place along the face (m over the ground at the face): the crown's underside. */
  crown: (s: number) => number;
  /** How far under the ground the first course is bedded (m). */
  foot: number;
  /** The first course's stone heights and lengths, [least, most] (m). */
  footH: readonly [number, number];
  footL: readonly [number, number];
  /** The upper courses' stone heights and lengths, [least, most] (m). */
  courseH: readonly [number, number];
  courseL: readonly [number, number];
  /** The share of upper stones standing about two courses high. */
  jumpers?: number;
  /** The share of stones with a knocked corner (the void it leaves stays open). */
  knocked?: number;
  /** How far a stone's top corners are drawn in at most (m): its sides lean in toward its top. */
  inset?: number;
  /** A print's tile: the skyline wraps at the face's length and a stone may run past its end (its s beyond len). */
  wrap?: boolean;
  /** The thinnest stone laid (m): a gap under the crown thinner than this is left to the crown. */
  minH?: number;
}

export interface DryStoneFaceStone {
  /** The outline (s along, y up), counter-clockwise (bottom edge left to right first): 4 to 9 points, flat. */
  pts: number[];
  /** The bounds of the outline. */
  s0: number; s1: number; y0: number; y1: number;
  /** The course it was laid in (0 the footing). */
  course: number;
  /** 0 a stone, 1 a footing stone (the first course), 2 a jumper (about two courses high). */
  kind: 0 | 1 | 2;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Lay one face of `len` metres. Stones never overlap (a bed joint of a few millimetres under each, a head joint between
 * neighbours), never stand above the crown, and cover the face but for the joints and the knocked corners' voids.
 */
export function layDryStoneFace(r: () => number, len: number, o: DryStoneFaceOptions): DryStoneFaceStone[] {
  const steps = layDryStoneFaceSteps(r, len, o);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}

/** layDryStoneFace in slices: a yield every few dozen stones (a long wall's face is laid across frames). */
export function* layDryStoneFaceSteps(r: () => number, len: number, o: DryStoneFaceOptions): Generator<void, DryStoneFaceStone[], void> {
  const cells = Math.max(2, Math.round(len / SKY_CELL_M));
  const cell = len / cells;
  // the skyline: `sky` the top of the courses laid before this one (what this course's stones bed on), `next` this
  // course's tops (merged when the course is done, so a stone never beds on its neighbour across a head joint). Both
  // are held per cell and kept conservative: a stone reads and writes every cell its span touches, its bed raised
  // over the highest top in any of them and its top written as its highest over each — so no two stones ever overlap
  const sky = new Float64Array(cells).fill(-o.foot), next = new Float64Array(cells).fill(-Infinity);
  const at = (i: number): number => (o.wrap ? ((i % cells) + cells) % cells : Math.max(0, Math.min(cells - 1, i)));
  const first = (s: number): number => Math.floor(s / cell), last = (s: number): number => Math.floor((s - 1e-9) / cell);
  const skyMax = (s0: number, s1: number): number => {
    let m = -Infinity;
    for (let i = first(s0), e = Math.max(first(s0), last(s1)); i <= e; i++) m = Math.max(m, sky[at(i)]);
    return m;
  };
  const crownMin = (s0: number, s1: number): number => {
    let m = Infinity;
    for (let s = s0; s <= s1 + 1e-9; s += Math.max(cell, (s1 - s0) / 6)) m = Math.min(m, o.crown(o.wrap ? ((s % len) + len) % len : s));
    return Math.min(m, o.crown(o.wrap ? ((s1 % len) + len) % len : s1));
  };
  const minH = o.minH ?? 0.06, jumpers = o.jumpers ?? 0.08, knocked = o.knocked ?? 0.5, inset = o.inset ?? 0.03;
  const stones: DryStoneFaceStone[] = [];
  for (let course = 0; course < 14; course++) {
    // the course's own height: the footing's big stones, then smaller ones up the wall
    const [h0, h1] = course === 0 ? o.footH : o.courseH, [l0, l1] = course === 0 ? o.footL : o.courseL;
    const hc = lerp(h0, h1, 0.35 + r() * 0.3);
    // (the joints of a course stagger against the course below: its first stone starts a part-stone in)
    const start = o.wrap ? r() * len : -(course === 0 ? r() * 0.12 : 0.05 + r() * 0.3);
    const end = o.wrap ? start + len : len;
    let s = start, laid = 0;
    while (s < end - 0.04) {
      const big = r() < (course === 0 ? 0.35 : 0.12);
      let L = lerp(l0, l1, big ? 0.65 + r() * 0.35 : Math.pow(r(), 1.5) * 0.85);
      if (!o.wrap && end - (s + L) < l0 * 0.6) L = end - s; // the last stone closes the face
      if (o.wrap && end - (s + L) < l0 * 0.6) L = end - s; // (the run closes on its own start: the wrap)
      const headJoint = 0.005 + r() * (r() < 0.2 ? 0.02 : 0.008);
      const a = Math.max(o.wrap ? -Infinity : 0, s), b = Math.min(o.wrap ? Infinity : len, s + L) - headJoint;
      const jumper = course > 0 && r() < jumpers;
      const tall = jumper ? 1.7 + r() * 0.4 : 0.6 + r() * 0.8;
      const tip = (r() - 0.5) * 0.2, cutPick = r(), cutSide = r(), cutDepth = 0.18 + r() * 0.24;
      const bedJ = 0.003 + r() * 0.006;
      s += L;
      if (b - a < 0.07) continue;
      // its bed follows what is under it: its two ends and its middle on the stones there, the whole bed then raised
      // just clear of the highest point under it (it sits on its neighbours below; no void opens under it)
      const mid = (a + b) / 2, q = (b - a) / 4;
      let bl = skyMax(a, a + q) + bedJ, bm = skyMax(mid - q, mid + q) + bedJ, br = skyMax(b - q, b) + bedJ;
      // (each half of the bed raised on its own: a high stone under one end lifts that end, not the whole stone)
      let liftL = 0, liftR = 0;
      const bedAt = (x: number): number => (x < mid ? lerp(bl, bm, (x - a) / Math.max(1e-6, mid - a)) : lerp(bm, br, (x - mid) / Math.max(1e-6, b - mid)));
      for (let i = first(a), e = last(b); i <= e; i++) {
        // (the bed's lowest over the part of the cell under the stone: at one of its ends, the bed being straight there)
        const x0 = Math.max(a, i * cell), x1 = Math.min(b, (i + 1) * cell);
        const low = Math.min(bedAt(x0), bedAt(x1), x0 < mid && x1 > mid ? bm : Infinity);
        const need = sky[at(i)] + bedJ - low;
        if (x0 < mid) liftL = Math.max(liftL, need);
        if (x1 > mid) liftR = Math.max(liftR, need);
      }
      bl += liftL; br += liftR; bm += Math.max(liftL, liftR);
      const base = Math.max(bl, bm, br);
      const room = crownMin(a, b) - base;
      if (room < minH) continue; // no room left here: the crown takes it
      let h = Math.min(hc * tall, room);
      if (room - h < minH * 0.9) h = room; // (no sliver of a course left under the crown: this stone takes it)
      const capL = Math.min(Math.max(bl, bm) + h * (1 + tip), crownMin(a, mid));
      const capR = Math.min(Math.max(bm, br) + h * (1 - tip), crownMin(mid, b));
      if (Math.min(capL - bl, capR - br) < minH * 0.7) continue;
      // the outline, counter-clockwise: the bed (left, middle, right), the right side up, the top back, the left side
      // down. A limestone lump is no brick: its sides lean in toward its top (each top corner drawn in a little, so the
      // void between two stones opens upward), and a corner is knocked off now and then — a top corner more often than a
      // bottom one, now and then two
      const insL = Math.min((b - a) * 0.2, r() * inset), insR = Math.min((b - a) * 0.2, r() * inset);
      const topAt = r(), topDip = 0.004 + r() * 0.022;
      const k1 = cutPick < knocked * 0.6 ? (cutSide < 0.5 ? 'tl' : 'tr') : cutPick < knocked ? (cutSide < 0.5 ? 'bl' : 'br') : '';
      const k2 = k1 && r() < 0.2 ? (k1[1] === 'l' ? (k1[0] === 't' ? 'tr' : 'br') : (k1[0] === 't' ? 'tl' : 'bl')) : '';
      const knock = (c: string): boolean => c === k1 || c === k2;
      const ds = (b - a) * cutDepth * 0.5, dy = Math.min(capL - bl, capR - br) * cutDepth;
      const pts: number[] = [];
      if (knock('bl')) pts.push(a + ds, bl); else pts.push(a, bl);
      // (the bed's middle corner only where the bed bends: on a straight bed it would add nothing but a triangle)
      if (Math.abs(bm - (bl + br) / 2) > 0.004) pts.push(mid, bm);
      if (knock('br')) pts.push(b - ds, br, b, br + dy); else pts.push(b, br);
      if (knock('tr')) pts.push(b - insR * 0.5, capR - dy, b - insR - ds, capR); else pts.push(b - insR, capR);
      // (a long stone's top is no straight edge: it dips a little somewhere along it, never above the line the stone
      // over it beds on)
      if (b - a > 0.4) { const t = 0.3 + topAt * 0.4; pts.push(lerp(b, a, t), lerp(capR, capL, t) - topDip); }
      if (knock('tl')) pts.push(a + insL + ds, capL, a + insL * 0.5, capL - dy); else pts.push(a + insL, capL);
      if (knock('bl')) pts.push(a, bl + dy);
      let s0 = Infinity, s1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (let k = 0; k < pts.length; k += 2) {
        s0 = Math.min(s0, pts[k]); s1 = Math.max(s1, pts[k]); y0 = Math.min(y0, pts[k + 1]); y1 = Math.max(y1, pts[k + 1]);
      }
      stones.push({ pts, s0, s1, y0, y1, course, kind: course === 0 ? 1 : jumper ? 2 : 0 });
      if (++laid % 48 === 0) yield;
      // the skyline takes the stone's uncut top — the line through its top corners, level past them to its sides (a
      // knocked top corner's void stays open: the stone above beds over it)
      const ta = a + insL, tb = b - insR;
      const topAtS = (x: number): number => lerp(capL, capR, Math.min(1, Math.max(0, (x - ta) / Math.max(1e-6, tb - ta))));
      for (let i = first(a), e = last(b); i <= e; i++) {
        const k = at(i);
        next[k] = Math.max(next[k], topAtS(Math.max(a, i * cell)), topAtS(Math.min(b, (i + 1) * cell)));
      }
    }
    for (let i = 0; i < cells; i++) if (next[i] > sky[i]) sky[i] = next[i];
    // the face is laid when no stretch has room left for a stone
    let open = false;
    for (let i = 0; i < sky.length && !open; i += 3) if (o.crown(Math.min(len, (i + 0.5) * cell)) - sky[i] >= minH) open = true;
    if (!open || (laid === 0 && course > 0)) break;
  }
  return stones;
}
