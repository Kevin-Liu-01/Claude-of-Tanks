// The technical drawings' vector overlays (258): an ID buffer (each armour plate, module or crew seat drawn in its own
// flat colour with depth testing, so only what the view shows of it) traced into polygons. The pixel boundaries of each
// ID's region chain into closed loops (outer loops clockwise in y-down pixel space, holes counter-clockwise, so an
// SVG path with fill-rule evenodd or nonzero draws the region with its holes), the staircase is corner-cut and then
// simplified (Douglas-Peucker). Pure: tools/drawing-page.ts traces in the browser, technicalDrawingTrace.selftest.mjs and
// the receipts in Node. First-party: Kevin B. Liu (NOTICE.md).

/** One closed loop: flat [x0, y0, x1, y1, ...] in pixel-corner coordinates, and its signed area (positive: an outer
 * loop, clockwise in y-down space; negative: a hole). */
export interface TracedLoop {
  readonly points: number[];
  readonly area: number;
}

/** Signed area of a flat loop (shoelace; positive for clockwise in y-down coordinates). */
export function loopArea(points: readonly number[]): number {
  let twice = 0;
  for (let i = 0, n = points.length; i < n; i += 2) {
    const j = (i + 2) % n;
    twice += points[i]! * points[j + 1]! - points[j]! * points[i + 1]!;
  }
  return twice / 2;
}

/**
 * Every non-zero ID's region as closed loops. `ids` is row-major (y down), 0 the background. Where two diagonal pixels
 * of one ID meet at a corner only, the loops keep them apart (4-connected regions).
 */
export function traceIdBuffer(ids: ArrayLike<number>, width: number, height: number): Map<number, TracedLoop[]> {
  const stride = width + 1;
  // per ID: directed boundary edges keyed by their start corner; each pixel side whose neighbour differs is one edge,
  // oriented with the ID's pixel on its right (clockwise round the region in y-down space)
  const edges = new Map<number, Map<number, number[]>>();
  const add = (id: number, from: number, to: number): void => {
    let byStart = edges.get(id);
    if (!byStart) edges.set(id, byStart = new Map());
    const list = byStart.get(from);
    if (list) list.push(to); else byStart.set(from, [to]);
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const id = ids[y * width + x]!;
      if (!id) continue;
      const tl = y * stride + x, tr = tl + 1, bl = tl + stride, br = bl + 1;
      if (y === 0 || ids[(y - 1) * width + x] !== id) add(id, tl, tr);
      if (x === width - 1 || ids[y * width + x + 1] !== id) add(id, tr, br);
      if (y === height - 1 || ids[(y + 1) * width + x] !== id) add(id, br, bl);
      if (x === 0 || ids[y * width + x - 1] !== id) add(id, bl, tl);
    }
  }
  const out = new Map<number, TracedLoop[]>();
  for (const [id, byStart] of edges) {
    const loops: TracedLoop[] = [];
    for (const start of [...byStart.keys()]) {
      while (byStart.get(start)?.length) {
        const points: number[] = [];
        let from = start, prevDx = 0, prevDy = 0;
        for (;;) {
          const choices = byStart.get(from);
          if (!choices || !choices.length) break;
          // at a corner two pixels of the region share only diagonally, turn right (keeps 4-connected regions apart)
          let pick = 0;
          if (choices.length > 1) {
            let best = -Infinity;
            choices.forEach((to, index) => {
              const dx = (to % stride) - (from % stride), dy = Math.floor(to / stride) - Math.floor(from / stride);
              const turn = prevDx * dy - prevDy * dx; // > 0: a right turn in y-down space
              if (turn > best) { best = turn; pick = index; }
            });
          }
          const to = choices.splice(pick, 1)[0]!;
          if (!choices.length) byStart.delete(from);
          const x = from % stride, y = Math.floor(from / stride);
          const dx = (to % stride) - x, dy = Math.floor(to / stride) - y;
          if (dx !== prevDx || dy !== prevDy) points.push(x, y); // keep corners only
          prevDx = dx; prevDy = dy;
          from = to;
          if (from === start) break;
        }
        // the first corner may sit mid-run when the loop closed on the same heading
        if (points.length >= 6) {
          const n = points.length;
          const ax = points[n - 2]!, ay = points[n - 2 + 1]!, bx = points[0]!, by = points[1]!, cx = points[2]!, cy = points[3]!;
          if ((ax === bx && bx === cx) || (ay === by && by === cy)) points.splice(0, 2);
          loops.push({ points, area: loopArea(points) });
        }
      }
    }
    out.set(id, loops);
  }
  return out;
}

/** Cut a pixel staircase's corners by at most half a pixel along each edge: a run of 1-pixel steps becomes its diagonal
 * (each step's midpoints), a long edge's corner loses a 0.5 px chamfer only. */
export function cutCorners(points: readonly number[]): number[] {
  const out: number[] = [];
  const n = points.length;
  for (let i = 0; i < n; i += 2) {
    const p = (i - 2 + n) % n, q = (i + 2) % n;
    const x = points[i]!, y = points[i + 1]!;
    const inX = points[p]! - x, inY = points[p + 1]! - y, inLength = Math.hypot(inX, inY);
    const outX = points[q]! - x, outY = points[q + 1]! - y, outLength = Math.hypot(outX, outY);
    const a = Math.min(inLength / 2, .5) / (inLength || 1), b = Math.min(outLength / 2, .5) / (outLength || 1);
    out.push(x + inX * a, y + inY * a, x + outX * b, y + outY * b);
  }
  // a unit step's two cuts meet at its midpoint: drop the repeats
  const unique: number[] = [];
  for (let i = 0; i < out.length; i += 2) {
    const px = unique[unique.length - 2], py = unique[unique.length - 1];
    if (px === undefined || Math.abs(px - out[i]!) > 1e-9 || Math.abs(py! - out[i + 1]!) > 1e-9) unique.push(out[i]!, out[i + 1]!);
  }
  if (unique.length >= 4 && Math.abs(unique[0]! - unique[unique.length - 2]!) < 1e-9 && Math.abs(unique[1]! - unique[unique.length - 1]!) < 1e-9) {
    unique.splice(-2, 2);
  }
  return unique;
}

function perpendicular(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay, length = Math.hypot(dx, dy);
  return length ? Math.abs((px - ax) * dy - (py - ay) * dx) / length : Math.hypot(px - ax, py - ay);
}

/** Douglas-Peucker on a closed loop: keeps the two farthest-apart corners and every point more than `tolerance` off. */
export function simplifyLoop(points: readonly number[], tolerance: number): number[] {
  const n = points.length / 2;
  if (n <= 4) return points.slice();
  let far = 0, farthest = -1;
  for (let i = 1; i < n; i++) {
    const d = Math.hypot(points[2 * i]! - points[0]!, points[2 * i + 1]! - points[1]!);
    if (d > farthest) { farthest = d; far = i; }
  }
  const keep = new Uint8Array(n);
  keep[0] = 1; keep[far] = 1;
  const stack: [number, number][] = [[0, far], [far, n]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const ax = points[2 * (a % n)]!, ay = points[2 * (a % n) + 1]!, bx = points[2 * (b % n)]!, by = points[2 * (b % n) + 1]!;
    let worst = -1, at = -1;
    for (let i = a + 1; i < b; i++) {
      const d = perpendicular(points[2 * i]!, points[2 * i + 1]!, ax, ay, bx, by);
      if (d > worst) { worst = d; at = i; }
    }
    if (worst > tolerance) { keep[at] = 1; stack.push([a, at], [at, b]); }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(points[2 * i]!, points[2 * i + 1]!);
  return out;
}

/** True when (x, y) lies inside the region the loops draw (even-odd). */
export function insideLoops(loops: readonly (readonly number[])[], x: number, y: number): boolean {
  let inside = false;
  for (const points of loops) {
    for (let i = 0, n = points.length; i < n; i += 2) {
      const j = (i + 2) % n;
      const xi = points[i]!, yi = points[i + 1]!, xj = points[j]!, yj = points[j + 1]!;
      if ((yi > y) !== (yj > y) && x < xi + (y - yi) * (xj - xi) / (yj - yi)) inside = !inside;
    }
  }
  return inside;
}

/**
 * A point inside the region for its badge: the area-weighted centroid of its largest outer loop when that lies inside,
 * else the middle of the widest span of the region across the centroid's height.
 */
export function labelPoint(loops: readonly (readonly number[])[]): [number, number] | null {
  let largest: readonly number[] | null = null, largestArea = 0;
  for (const points of loops) {
    const area = loopArea(points);
    if (area > largestArea) { largestArea = area; largest = points; }
  }
  if (!largest) return null;
  let cx = 0, cy = 0, twice = 0;
  for (let i = 0, n = largest.length; i < n; i += 2) {
    const j = (i + 2) % n, cross = largest[i]! * largest[j + 1]! - largest[j]! * largest[i + 1]!;
    twice += cross; cx += (largest[i]! + largest[j]!) * cross; cy += (largest[i + 1]! + largest[j + 1]!) * cross;
  }
  if (!twice) return null;
  cx /= 3 * twice; cy /= 3 * twice;
  if (insideLoops(loops, cx, cy)) return [cx, cy];
  const crossings: number[] = [];
  for (const points of loops) {
    for (let i = 0, n = points.length; i < n; i += 2) {
      const j = (i + 2) % n;
      const yi = points[i + 1]!, yj = points[j + 1]!;
      if ((yi > cy) !== (yj > cy)) crossings.push(points[i]! + (cy - yi) * (points[j]! - points[i]!) / (yj - yi));
    }
  }
  crossings.sort((a, b) => a - b);
  let best: [number, number] | null = null, widest = 0;
  for (let i = 0; i + 1 < crossings.length; i += 2) {
    const span = crossings[i + 1]! - crossings[i]!;
    if (span > widest) { widest = span; best = [(crossings[i]! + crossings[i + 1]!) / 2, cy]; }
  }
  return best;
}

/** The loops as an SVG path's d (absolute moves and lines, `digits` decimals), scaled by `scale`. */
export function loopsToPath(loops: readonly (readonly number[])[], scale = 1, digits = 1): string {
  const f = (v: number): string => {
    const text = (v * scale).toFixed(digits);
    return text.includes('.') ? text.replace(/\.?0+$/, '') : text;
  };
  return loops.map((points) => {
    let d = `M${f(points[0]!)} ${f(points[1]!)}`;
    for (let i = 2; i < points.length; i += 2) d += `L${f(points[i]!)} ${f(points[i + 1]!)}`;
    return `${d}Z`;
  }).join('');
}

/**
 * One ID's traced loops, ready to draw: corner-cut, simplified at `tolerance` pixels, specks under `minArea` square
 * pixels dropped (a hole keeps its outer loop's verdict).
 */
export function cleanLoops(loops: readonly TracedLoop[], tolerance: number, minArea: number): number[][] {
  return loops.filter((loop) => Math.abs(loop.area) >= minArea)
    .map((loop) => simplifyLoop(cutCorners(loop.points), tolerance))
    .filter((points) => points.length >= 6);
}
