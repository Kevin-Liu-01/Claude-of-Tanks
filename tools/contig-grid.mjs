// §B2 CONTIGUITY GRID — the plan-view hole raster shared by tools/standard-check-page.html (the gate's GPU
// render) and its Node receipt (tools/contig-grid.selftest.mjs). Pure: no DOM, no WebGL, no THREE.
//
// HULL-ANCHORED LATTICE (2026-10-16, item/guards-contig-grid-227). The scan used to lay its ~6 cm grid from each
// tank's rendered AABB (x0 = bb.min.x - margin, cells stretched to fill ceil(width / 6 cm)), so an unrelated add-on
// that moved the AABB (VH.04's guns 1.2-2 cm longer, a proud spare-link run) re-phased the grid over the whole hull
// and hid or revealed real 6-7 cm gaps: 226's nine contiguity "regressions" were mostly pre-existing gaps.
// Now the cell edges sit at fixed multiples of CONTIG_CELL_M in the vehicle frame (the tank root's origin), the
// cells are exactly CONTIG_CELL_M wide, and the AABB only decides how many lattice cells the frame spans. A change
// that does not touch a gap's walls cannot change whether that gap reads as a hole.
//
// EVERY SUB-CELL PHASE. One render on the anchored pixel lattice (CONTIG_SUB pixels per cell edge, pixel edges on
// the same lattice) is re-binned into cells at all CONTIG_SUB x CONTIG_SUB pixel offsets: the same pixels, no extra
// render. A cell is uncovered only when all of its sample pixels miss (thin rails survive), so a single phase found a
// through-gap of width g only when a 4 cm sample span fell inside it: every gap >= 10 cm, gaps of 4-10 cm by luck of
// alignment. Across the nine phases the sample spans start every 2 cm, so every enclosed gap at least 6 cm wide in
// both plan directions is found wherever it sits. The primary phase (0,0) stays the raster the approved-opening
// classifier reads (tools/source-openings-policy.mjs); a hole cell at another phase that lies more than one cell from
// every primary hole cell is a PHASE-ONLY hole and fails the gate like any unexpected hole.

export const CONTIG_CELL_M = 0.06;
const CONTIG_SUB = 3;
const CONTIG_MARGIN_CELLS = 2;
export const CONTIG_FRAMING = 'hull-anchored';
export const LEGACY_CONTIG_FRAMING = 'aabb-legacy';

/** Every pixel phase of a cell, the primary (0,0) first. */
export const CONTIG_PHASES = Object.freeze(Array.from({length: CONTIG_SUB * CONTIG_SUB},
  (_, i) => Object.freeze([i % CONTIG_SUB, Math.floor(i / CONTIG_SUB)])));
export const PRIMARY_CONTIG_PHASE = CONTIG_PHASES[0];

function finiteBounds(bounds) {
  const {minX, maxX, minZ, maxZ} = bounds ?? {};
  if (![minX, maxX, minZ, maxZ].every(Number.isFinite) || maxX < minX || maxZ < minZ)
    throw new Error('Expected finite plan bounds');
  return {minX, maxX, minZ, maxZ};
}

function withPixels(frame) {
  return Object.freeze({...frame, cellM: CONTIG_CELL_M, sub: CONTIG_SUB,
    pw: frame.gridW * CONTIG_SUB, ph: frame.gridH * CONTIG_SUB});
}

/** The gate frame: plan bounds (any AABB) snapped OUT to the vehicle-frame lattice with at least
 * CONTIG_MARGIN_CELLS of exterior on every side. x grows to the right, rows count DOWN from z1. */
export function anchoredContigFrame(bounds, {originX = 0, originZ = 0} = {}) {
  const {minX, maxX, minZ, maxZ} = finiteBounds(bounds);
  if (!Number.isFinite(originX) || !Number.isFinite(originZ)) throw new Error('Expected a finite lattice origin');
  const C = CONTIG_CELL_M, margin = CONTIG_MARGIN_CELLS * C;
  const kx0 = Math.floor((minX - margin - originX) / C), kx1 = Math.ceil((maxX + margin - originX) / C);
  const kz0 = Math.floor((minZ - margin - originZ) / C), kz1 = Math.ceil((maxZ + margin - originZ) / C);
  const gridW = Math.max(4, kx1 - kx0), gridH = Math.max(4, kz1 - kz0);
  return withPixels({framing: CONTIG_FRAMING, originX, originZ, kx0, kz1,
    x0: originX + kx0 * C, x1: originX + (kx0 + gridW) * C,
    z0: originZ + (kz1 - gridH) * C, z1: originZ + kz1 * C, gridW, gridH});
}

/** The pre-227 frame (main through 226): cells stretched over the margin-padded AABB. Kept ONLY as the audit's
 * "what did the old gate see" reference and the receipt's negative control; the gate never uses it. */
export function legacyContigFrame(bounds) {
  const {minX, maxX, minZ, maxZ} = finiteBounds(bounds);
  const margin = CONTIG_MARGIN_CELLS * CONTIG_CELL_M;
  const x0 = minX - margin, x1 = maxX + margin, z0 = minZ - margin, z1 = maxZ + margin;
  return withPixels({framing: LEGACY_CONTIG_FRAMING, x0, x1, z0, z1,
    gridW: Math.max(4, Math.ceil((x1 - x0) / CONTIG_CELL_M)), gridH: Math.max(4, Math.ceil((z1 - z0) / CONTIG_CELL_M))});
}

/** World centre of cell (gx, gy) at a pixel phase. The primary phase is the historical formula, term for term,
 * so the openings policy's raster-centre checks hold exactly. */
export function contigCellCenter(frame, gx, gy, [fx, fz] = PRIMARY_CONTIG_PHASE) {
  return {
    x: frame.x0 + (fx / CONTIG_SUB + gx + .5) * (frame.x1 - frame.x0) / frame.gridW,
    z: frame.z1 - (fz / CONTIG_SUB + gy + .5) * (frame.z1 - frame.z0) / frame.gridH,
  };
}

/** Hull-frame lattice index of the anchored cell centred at (x, z): cell k spans [k, k + 1) * CONTIG_CELL_M.
 * Null when the point is not a lattice cell centre (a stretched legacy raster, a sub-cell phase). */
export function contigLatticeCell(x, z, {originX = 0, originZ = 0} = {}) {
  const fx = (x - originX) / CONTIG_CELL_M - .5, fz = (z - originZ) / CONTIG_CELL_M - .5;
  const kx = Math.round(fx), kz = Math.round(fz);
  return Math.abs(fx - kx) < 1e-6 && Math.abs(fz - kz) < 1e-6 ? [kx, kz] : null;
}

/** True when a scan's raster is the anchored lattice itself: exact cell size, lattice-aligned edges. */
export function onContigLattice(scan) {
  const b = scan?.bounds;
  if (scan?.framing !== CONTIG_FRAMING || scan.cellM !== CONTIG_CELL_M || !b) return false;
  const ox = scan.origin?.x ?? 0, oz = scan.origin?.z ?? 0;
  const k = (v, o) => { const f = (v - o) / CONTIG_CELL_M; return Math.abs(f - Math.round(f)) < 1e-6; };
  return [b.x0, b.x1].every(v => k(v, ox)) && [b.z0, b.z1].every(v => k(v, oz))
    && Math.round((b.x1 - b.x0) / CONTIG_CELL_M) === scan.gridW && Math.round((b.z1 - b.z0) / CONTIG_CELL_M) === scan.gridH;
}

function checkMask(hit, frame) {
  if (!(hit instanceof Uint8Array) || hit.length !== frame.pw * frame.ph) throw new Error('Expected a pw x ph hit mask');
}

/** Cell coverage at one pixel phase: covered when ANY of the cell's SUB x SUB pixels hit. */
function phaseCoverage(hit, frame, [fx, fz] = PRIMARY_CONTIG_PHASE) {
  checkMask(hit, frame);
  const {pw, ph} = frame, S = CONTIG_SUB;
  const gw = Math.floor((pw - fx) / S), gh = Math.floor((ph - fz) / S);
  const covered = new Uint8Array(gw * gh);
  let coveredCells = 0;
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      let h = 0;
      for (let sy = 0; sy < S && !h; sy++) {
        const row = (fz + gy * S + sy) * pw + fx + gx * S;
        for (let sx = 0; sx < S && !h; sx++) h = hit[row + sx];
      }
      covered[gy * gw + gx] = h ? 1 : 0;
      coveredCells += h ? 1 : 0;
    }
  }
  return {covered, gw, gh, coveredCells};
}

/** Flood the exterior from the frame border; what stays uncovered and unreached is enclosed sky. */
function exteriorCells(covered, gw, gh) {
  const outside = new Uint8Array(gw * gh), stack = [];
  const push = (gx, gy) => {
    if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) return;
    const i = gy * gw + gx;
    if (covered[i] || outside[i]) return;
    outside[i] = 1; stack.push(gx, gy);
  };
  for (let gx = 0; gx < gw; gx++) { push(gx, 0); push(gx, gh - 1); }
  for (let gy = 0; gy < gh; gy++) { push(0, gy); push(gw - 1, gy); }
  while (stack.length) {
    const gy = stack.pop(), gx = stack.pop();
    push(gx + 1, gy); push(gx - 1, gy); push(gx, gy + 1); push(gx, gy - 1);
  }
  return outside;
}

/** Enclosed hole cells at one phase, clustered (4-connected), largest first. */
function phaseHoles(hit, frame, phase = PRIMARY_CONTIG_PHASE) {
  const {covered, gw, gh, coveredCells} = phaseCoverage(hit, frame, phase);
  const outside = exteriorCells(covered, gw, gh);
  const seen = new Uint8Array(gw * gh), samples = [], clusters = [];
  for (let i = 0; i < gw * gh; i++) {
    if (covered[i] || outside[i] || seen[i]) continue;
    const st = [i], cells = [];
    seen[i] = 1;
    while (st.length) {
      const j = st.pop(), gx = j % gw, gy = (j / gw) | 0;
      cells.push([gx, gy]);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = gx + dx, ny = gy + dy;
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
        const n = ny * gw + nx;
        if (covered[n] || outside[n] || seen[n]) continue;
        seen[n] = 1; st.push(n);
      }
    }
    let sx = 0, sy = 0;
    for (const [gx, gy] of cells) {
      sx += gx; sy += gy;
      samples.push({gx, gy, ...contigCellCenter(frame, gx, gy, phase)});
    }
    const c = contigCellCenter(frame, sx / cells.length, sy / cells.length, phase);
    clusters.push({cells: cells.length, x: +c.x.toFixed(2), z: +c.z.toFixed(2), members: cells});
  }
  clusters.sort((a, b) => b.cells - a.cells);
  return {phase, gw, gh, coveredCells, holeCells: samples.length, samples, clusters};
}

function cellPixels(frame, [fx, fz], gx, gy, visit) {
  for (let sy = 0; sy < CONTIG_SUB; sy++)
    for (let sx = 0; sx < CONTIG_SUB; sx++)
      visit((fz + gy * CONTIG_SUB + sy) * frame.pw + fx + gx * CONTIG_SUB + sx);
}

/** Uncovered pixel run through (px, py) along one axis, in pixels; Infinity when it reaches the frame edge. */
function run(hit, frame, px, py, dx, dy) {
  let n = 1;
  for (const s of [1, -1]) {
    let x = px + s * dx, y = py + s * dy;
    for (;;) {
      if (x < 0 || y < 0 || x >= frame.pw || y >= frame.ph) return Infinity;
      if (hit[y * frame.pw + x]) break;
      n++; x += s * dx; y += s * dy;
    }
  }
  return n;
}

/** Group hole cells (any phases) into distinct plan gaps: pixel-connected unions of their SUB x SUB blocks.
 * Each gap reports its centre, plan extent (w along x, d along z, metres), the narrow through-width estimate
 * (median over its pixels of the shorter uncovered run, metres) and the largest single-phase cell count. */
function contigGaps(hit, frame, phaseCells) {
  checkMask(hit, frame);
  const owner = new Int32Array(frame.pw * frame.ph).fill(-1), entries = [];
  phaseCells.forEach(({phase, gx, gy}, e) => {
    entries.push({phase, gx, gy});
    cellPixels(frame, phase, gx, gy, i => { owner[i] = e; });
  });
  const seen = new Uint8Array(owner.length), gaps = [];
  const px = (frame.x1 - frame.x0) / frame.pw, pz = (frame.z1 - frame.z0) / frame.ph;
  for (let start = 0; start < owner.length; start++) {
    if (owner[start] < 0 || seen[start]) continue;
    const st = [start], members = new Set(), widths = [];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    seen[start] = 1;
    while (st.length) {
      const i = st.pop(), x = i % frame.pw, y = (i / frame.pw) | 0;
      members.add(owner[i]);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      widths.push(Math.min(run(hit, frame, x, y, 1, 0) * px, run(hit, frame, x, y, 0, 1) * pz));
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= frame.pw || ny >= frame.ph) continue;
        const n = ny * frame.pw + nx;
        if (owner[n] < 0 || seen[n]) continue;
        seen[n] = 1; st.push(n);
      }
    }
    widths.sort((a, b) => a - b);
    const perPhase = new Map();
    for (const e of members) {
      const key = entries[e].phase.join(',');
      perPhase.set(key, (perPhase.get(key) ?? 0) + 1);
    }
    gaps.push({
      x: +(frame.x0 + ((minX + maxX + 1) / 2) * px).toFixed(3),
      z: +(frame.z1 - ((minY + maxY + 1) / 2) * pz).toFixed(3),
      w: +((maxX - minX + 1) * px).toFixed(3), d: +((maxY - minY + 1) * pz).toFixed(3),
      gap: +widths[widths.length >> 1].toFixed(3),
      cells: Math.max(...perPhase.values()), phases: perPhase.size,
      pixelBox: [minX, minY, maxX, maxY],
    });
  }
  return gaps.sort((a, b) => b.cells - a.cells || a.x - b.x || a.z - b.z);
}

/** The whole §B2 scan over a hit mask (row 0 = the +z edge). Returns the primary raster in the historical shape
 * (holeCells, samples, bounds, clusters, coveredCells, gridW, gridH, cellM) plus every phase's count, the
 * phase-only holes and the distinct gaps behind them. */
export function contigScan(hit, frame, {phases = frame.framing === CONTIG_FRAMING ? CONTIG_PHASES : [PRIMARY_CONTIG_PHASE]} = {}) {
  checkMask(hit, frame);
  if (phases[0]?.[0] !== 0 || phases[0]?.[1] !== 0) throw new Error('The primary phase (0,0) comes first');
  const scans = phases.map(phase => phaseHoles(hit, frame, phase));
  const primary = scans[0];
  // A primary hole explains another phase's hole cell that lies within one cell of it: the same void seen through a
  // shifted grid (an approved opening's ragged edge). Anything further from every primary hole is phase-only.
  const primaryPx = new Uint8Array(frame.pw * frame.ph);
  for (const s of primary.samples) {
    const px0 = (s.gx - 1) * CONTIG_SUB, py0 = (s.gy - 1) * CONTIG_SUB;
    for (let y = Math.max(0, py0); y < Math.min(frame.ph, py0 + 3 * CONTIG_SUB); y++)
      for (let x = Math.max(0, px0); x < Math.min(frame.pw, px0 + 3 * CONTIG_SUB); x++) primaryPx[y * frame.pw + x] = 1;
  }
  const phaseOnly = [];
  for (const scan of scans.slice(1)) {
    for (const s of scan.samples) {
      let explained = false;
      cellPixels(frame, scan.phase, s.gx, s.gy, i => { explained ||= primaryPx[i] === 1; });
      if (!explained) phaseOnly.push({phase: scan.phase, gx: s.gx, gy: s.gy, x: s.x, z: s.z});
    }
  }
  const allHoleCells = scans.flatMap(scan => scan.samples.map(s => ({phase: scan.phase, gx: s.gx, gy: s.gy})));
  const gaps = contigGaps(hit, frame, allHoleCells);
  const phaseOnlyGaps = contigGaps(hit, frame, phaseOnly);
  return {
    framing: frame.framing,
    ...(frame.framing === CONTIG_FRAMING ? {origin: {x: frame.originX, z: frame.originZ}} : {}),
    holeCells: primary.holeCells,
    samples: primary.samples,
    bounds: {x0: frame.x0, x1: frame.x1, z0: frame.z0, z1: frame.z1},
    clusters: primary.clusters.slice(0, 3).map(({members, ...c}) => c),
    coveredCells: primary.coveredCells,
    gridW: frame.gridW, gridH: frame.gridH, cellM: CONTIG_CELL_M,
    phases: scans.map(s => ({phase: s.phase, holeCells: s.holeCells})),
    phaseOnlyCells: phaseOnly.length,
    phaseOnly: phaseOnly.slice(0, 64),
    gaps: gaps.map(({pixelBox, ...g}) => g),
    phaseOnlyGaps: phaseOnlyGaps.map(({pixelBox, ...g}) => g),
  };
}

/** The §B2 verdict: the openings policy's primary-raster verdict AND a complete anchored scan (every phase) with no
 * phase-only hole. Fails closed on a legacy-framed, off-lattice or partial scan. */
export function contiguityPassed(scan, opening) {
  return opening?.passed === true && onContigLattice(scan)
    && Array.isArray(scan.phases) && scan.phases.length === CONTIG_PHASES.length
    && Number.isInteger(scan.phaseOnlyCells) && scan.phaseOnlyCells === 0;
}

/** An anchored primary raster holding exactly these hull-frame lattice cells [[kx, kz], ...]: the receipts' stand-in
 * for a real scan of a pinned approved opening (tools/ariete-source-openings.mjs, tools/barak-source-openings.mjs).
 * The frame is the page's frame for `aabb` (plan bounds of the rendered build, tank root at the origin) when given,
 * else `pad` lattice cells around the cells. */
export function latticeCellScan(cells, {pad = 4, aabb = null} = {}) {
  const C = CONTIG_CELL_M, kxs = cells.map(c => c[0]), kzs = cells.map(c => c[1]);
  const frame = aabb ? anchoredContigFrame(aabb) : (() => {
    const kx0 = Math.min(...kxs) - pad, kz1 = Math.max(...kzs) + 1 + pad;
    const gridW = Math.max(...kxs) + 1 + pad - kx0, gridH = kz1 - (Math.min(...kzs) - pad);
    return withPixels({framing: CONTIG_FRAMING, originX: 0, originZ: 0, kx0, kz1,
      x0: kx0 * C, x1: (kx0 + gridW) * C, z0: (kz1 - gridH) * C, z1: kz1 * C, gridW, gridH});
  })();
  const samples = cells.map(([kx, kz]) => {
    const gx = kx - frame.kx0, gy = frame.kz1 - kz - 1;
    if (gx < 0 || gy < 0 || gx >= frame.gridW || gy >= frame.gridH) throw new Error(`Cell ${kx},${kz} lies outside the frame`);
    return {gx, gy, ...contigCellCenter(frame, gx, gy)};
  });
  return {framing: CONTIG_FRAMING, origin: {x: 0, z: 0}, holeCells: samples.length, samples,
    bounds: {x0: frame.x0, x1: frame.x1, z0: frame.z0, z1: frame.z1}, gridW: frame.gridW, gridH: frame.gridH, cellM: C,
    phases: CONTIG_PHASES.map(phase => ({phase, holeCells: samples.length})), phaseOnlyCells: 0};
}

/** Hull-frame centre of lattice cell [kx, kz] at sub-pixel (sx, sy) of the primary phase, sy = 0 being the +z row
 * (origin 0): the exact page pixel centres a pinned opening's air witnesses ray through. */
export function latticeSubpixelCenter([kx, kz], sx = 1, sy = 1) {
  return [(kx + (sx + .5) / CONTIG_SUB) * CONTIG_CELL_M, (kz + 1 - (sy + .5) / CONTIG_SUB) * CONTIG_CELL_M];
}

/** True when `scan` is an anchored raster at origin 0 whose primary hole samples are exactly the pinned lattice cells. */
export function scanMatchesLatticeCells(scan, cells) {
  if (!Array.isArray(cells) || !onContigLattice(scan) || scan.origin?.x !== 0 || scan.origin?.z !== 0
      || scan.holeCells !== cells.length || !Array.isArray(scan.samples) || scan.samples.length !== cells.length) return false;
  const pinned = new Set(cells.map(([kx, kz]) => `${kx},${kz}`)), found = new Set();
  for (const s of scan.samples) {
    const k = contigLatticeCell(s.x, s.z);
    if (!k || !pinned.has(`${k[0]},${k[1]}`)) return false;
    found.add(`${k[0]},${k[1]}`);
  }
  return found.size === pinned.size;
}

/** True when (x, z) is the primary-phase centre of one of the pinned lattice cells. */
export function isLatticeCellCenter(x, z, cells) {
  const k = contigLatticeCell(x, z);
  return Boolean(k && cells?.some(([kx, kz]) => kx === k[0] && kz === k[1]));
}

/** Rasterise axis-aligned plan rectangles [{x0,x1,z0,z1}] into a hit mask by pixel-centre coverage (the GPU rule
 * for axis-aligned quads). Receipt and audit fixtures only; the gate renders the real build. */
export function rasterizePlanRects(frame, rects) {
  const hit = new Uint8Array(frame.pw * frame.ph);
  const px = (frame.x1 - frame.x0) / frame.pw, pz = (frame.z1 - frame.z0) / frame.ph;
  for (let py = 0; py < frame.ph; py++) {
    const z = frame.z1 - (py + .5) * pz;
    for (let ix = 0; ix < frame.pw; ix++) {
      const x = frame.x0 + (ix + .5) * px;
      for (const r of rects) if (x >= r.x0 && x < r.x1 && z >= r.z0 && z < r.z1) { hit[py * frame.pw + ix] = 1; break; }
    }
  }
  return hit;
}

/** Plan bounds of a rectangle set (the fixture's stand-in for the rendered AABB). */
export function planRectBounds(rects) {
  return rects.reduce((b, r) => ({minX: Math.min(b.minX, r.x0), maxX: Math.max(b.maxX, r.x1),
    minZ: Math.min(b.minZ, r.z0), maxZ: Math.max(b.maxZ, r.z1)}),
  {minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity});
}
