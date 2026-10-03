// The mountains lane (2026-10-02; owner: "clouds are the bar; mountains, horizons and terrain must match"): the eroded
// landform of the ranged rings and the far range (horizonMassif.ts) and the tableland rings' bed stair
// (horizonEscarpment.ts). Live laws: determinism, the landform's mean and bounds, the erosion's downslope grain, the
// passes' contracts (heights only, untouched weightless rows, no needles, bounded cliffs, cut-only canyons, flat caps
// level), the triangle budget unchanged on every map, and the cone measure on the ranged rings against the round-72b
// ring as the negative control.
import assert from 'node:assert/strict';
import { createMassifField, carveMassifRing, cutMassifCanyonsSteps, erosionOctave, suppressNeedles } from './horizonMassif.ts';
import { createEscarpmentField, carveEscarpmentRing } from './horizonEscarpment.ts';
import { HORIZON_RELIEF_CHARACTERS, resolveHorizonRelief } from './horizonRelief.ts';
import { HORIZON_SEGMENTS, sampleHorizonGeometry } from './maps/horizon.ts';
import { getMapConfig, MAP_IDS } from './maps/index.ts';

const n = HORIZON_SEGMENTS;
const drain = (steps) => { let step = steps.next(); while (!step.done) step = steps.next(); return step.value; };

// --- the landform: deterministic, mean one over its annulus, the cols cut and the summits through the knee ----------
for (const character of HORIZON_RELIEF_CHARACTERS) {
  const s = resolveHorizonRelief(character).massif;
  if (character === 'mesa') { assert.equal(s, null, 'the tablelands carry no ranged landform (their canyons and stair are their own)'); continue; }
  assert.ok(s && s.contrast > 0.2 && s.contrast <= 0.5, `${character}: the landform scales a mass by a bounded share (${s?.contrast})`);
  assert.ok(s.gullyWavelengthM / 2 ** (s.gullyOctaves - 1) >= 55, `${character}: the finest couloir octave stays on the mesh (>= 55 m: ~3.5 columns at 1 km)`);
  const a = createMassifField(0x1234, s, [700, 1400]), b = createMassifField(0x1234, s, [700, 1400]), c = createMassifField(0x1235, s, [700, 1400]);
  let sum = 0, min = Infinity, max = -Infinity, differ = 0, count = 0;
  for (let j = 0; j < 30; j++) for (let i = 0; i < 120; i++) {
    const theta = (i / 120) * Math.PI * 2 + j * 0.013, r = 720 + j * 22.3;
    const x = Math.cos(theta) * r, z = Math.sin(theta) * r;
    const m = a.multiplier(x, z);
    assert.equal(m, b.multiplier(x, z), `${character}: the same seed carves the same landform`);
    if (Math.abs(m - c.multiplier(x, z)) > 1e-6) differ++;
    sum += m; min = Math.min(min, m); max = Math.max(max, m); count++;
  }
  assert.ok(Math.abs(sum / count - 1) < 0.06, `${character}: the multiplier averages one over the annulus (${(sum / count).toFixed(3)})`);
  assert.ok(min >= 1 - s.contrast * 1.1 && min < 1 - s.contrast * 0.5, `${character}: the cols cut down to about 1 - contrast (${min.toFixed(3)})`);
  assert.ok(max <= 1 + s.contrast * 0.75, `${character}: the summits rise through the knee, never a horn (${max.toFixed(3)} for contrast ${s.contrast})`);
  assert.ok(differ > count * 0.9, `${character}: another seed carves other ridges`);
}

// --- the erosion octave: its waves run DOWN the slope, and a flat floor carries none ------------------------------
{
  const g = new Float64Array(3);
  let along = 0, across = 0;
  for (let i = 0; i < 400; i++) {
    const x = 0.37 + i * 0.011, z = 1.71;
    // dir (0, 1.6) is ACROSS the slope: the phase runs along z, so the crests and troughs run along x (downslope)
    erosionOctave(x, z, 0, 1.6, 0x51, g); const v0 = g[0];
    erosionOctave(x + 0.04, z, 0, 1.6, 0x51, g); along += Math.abs(g[0] - v0);
    erosionOctave(x, z + 0.04, 0, 1.6, 0x51, g); across += Math.abs(g[0] - v0);
  }
  assert.ok(across > along * 3, `the couloirs run down the slope: the value changes ${(across / along).toFixed(1)}x faster across it`);
  erosionOctave(2.3, -0.7, 0, 0, 0x51, g);
  assert.ok(Math.abs(g[0] - 1) < 1e-9, 'no slope, no waves: a flat floor stays whole');
}

// --- the ring pass on a synthetic grid: heights only, weightless rows untouched, no needles ------------------------
function syntheticRing(rows, heightAt) {
  const positions = new Float32Array(n * rows * 3), heights = new Float32Array(n * rows);
  for (let row = 0; row < rows; row++) for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2, r = 700 + row * 24, i = row * n + k;
    positions[i * 3] = Math.cos(a) * r; positions[i * 3 + 2] = Math.sin(a) * r;
    heights[i] = positions[i * 3 + 1] = heightAt(a, r, row, k);
  }
  return { positions, heights };
}
{
  const rows = 20;
  const ring = syntheticRing(rows, (a, r) => 60 + 240 * Math.max(0, Math.sin(a * 5)) * Math.exp(-(((r - 1000) / 160) ** 2)));
  const before = { positions: ring.positions.slice(), heights: ring.heights.slice() };
  const floors = new Float32Array(rows).fill(60), weights = new Float32Array(rows);
  for (let row = 4; row < rows; row++) weights[row] = 1;
  carveMassifRing({ columns: n, rowCount: rows, positions: ring.positions, heights: ring.heights, floors, weights },
    createMassifField(77, resolveHorizonRelief('alpine').massif, [700, 1200]));
  let moved = 0;
  for (let i = 0; i < n * rows; i++) {
    assert.equal(ring.positions[i * 3], before.positions[i * 3], 'the carve keeps every radius and angle');
    assert.equal(ring.positions[i * 3 + 2], before.positions[i * 3 + 2], 'the carve keeps every radius and angle');
    assert.equal(ring.positions[i * 3 + 1], ring.heights[i], 'positions follow the heights');
    if (i < 4 * n) assert.equal(ring.heights[i], before.heights[i], 'a weightless row is untouched');
    else if (Math.abs(ring.heights[i] - before.heights[i]) > 1) moved++;
  }
  assert.ok(moved > n * 4, `the carve reaches the weighted rows (${moved} vertices moved)`);
  for (let row = 4; row < rows; row++) for (let k = 0; k < n; k++) {
    const i = row * n + k, l = row * n + (k + n - 1) % n, r = row * n + (k + 1) % n;
    const arc = Math.hypot(ring.positions[r * 3] - ring.positions[l * 3], ring.positions[r * 3 + 2] - ring.positions[l * 3 + 2]) / 2;
    assert.ok(Math.min(ring.heights[i] - ring.heights[l], ring.heights[i] - ring.heights[r]) <= arc + 1e-3, 'no one-column needle in a carved row');
  }
  // the needle filter alone: a single column spike comes down to one arc step over its higher neighbour
  const spike = syntheticRing(1, (_a, _r, _row, k) => (k === 10 ? 300 : 40));
  suppressNeedles(spike.heights, spike.positions, 0, n);
  const arc = Math.hypot(spike.positions[11 * 3] - spike.positions[9 * 3], spike.positions[11 * 3 + 2] - spike.positions[9 * 3 + 2]) / 2;
  assert.ok(Math.abs(spike.heights[10] - (40 + arc)) < 1e-3, `the spike settles one arc step over its neighbours (${spike.heights[10].toFixed(1)})`);
  // the canyons only cut
  const tables = syntheticRing(rows, (a, r) => (r > 820 && r < 1100 && Math.sin(a * 3) > 0 ? 260 : 50));
  const tablesBefore = tables.heights.slice();
  drain(cutMassifCanyonsSteps({ columns: n, rowCount: rows, positions: tables.positions, heights: tables.heights, floors, weights },
    createMassifField(78, { ...resolveHorizonRelief('rolling').massif, contrast: 0.5, concavity: 1, smoothM: 0 }, [700, 1200]), 0.2));
  let cut = 0;
  for (let i = 0; i < n * rows; i++) {
    assert.ok(tables.heights[i] <= tablesBefore[i] + 1e-4, 'a side canyon never raises the ground');
    if (tables.heights[i] < tablesBefore[i] - 5) cut++;
  }
  assert.ok(cut > 100 && cut < n * rows * 0.5, `the canyons cut into the tables without levelling them (${cut} vertices)`);
}

// --- the bed stair: monotone in height, a flat cap stays level, the ring pass bounds every cliff --------------------
{
  const settings = { bedM: [36, 70], cliffShare: [0.28, 0.48], talusRise: 0.32, talusCurve: 2.2, dipPerKm: 0, meanderM: 24, meanderWavelengthM: 300 };
  const field = createEscarpmentField(0x5e5c, settings);
  for (const [x, z] of [[900, 100], [-700, 820], [30, -1250]]) {
    let previous = -Infinity, cliffs = 0, benches = 0;
    for (let h = 40; h <= 520; h += 1) {
      const out = field.apply(x, z, h, 30, 0);
      assert.ok(out >= previous - 1e-9, `the stair is monotone in height at (${x}, ${z})`);
      const step = out - previous;
      if (Number.isFinite(previous)) { if (step > 1.4) cliffs++; else if (step < 0.6) benches++; }
      previous = out;
    }
    assert.ok(cliffs > 60 && benches > 150, `every bed is a cliff over a talus slope (${cliffs} cliff and ${benches} bench metres of 480)`);
  }
  // a cap: the bed tops are fixed points of the stair everywhere (the caprock rim), and any other level keeps one height
  // within a quad's reach — the cliff share wanders over 700 m, so a cap can only tilt by a few metres per kilometre
  const tops = Array.from(field.beds).filter((b) => b > 60 && b < 500);
  for (const top of tops) for (const [x, z] of [[1000, 0], [-640, 900], [200, -1300]]) {
    assert.ok(Math.abs(field.apply(x, z, top, 30, 0) - top) < 1e-6, `a bed top is the caprock rim: it keeps its level (${top.toFixed(1)} m)`);
  }
  for (const h of [212, 333.3]) {
    const levels = [[1000, 0], [1015, 40], [985, -40], [1060, 70]].map(([x, z]) => field.apply(x, z, h, 30, 0));
    assert.ok(Math.max(...levels) - Math.min(...levels) < 3, `a flat cap keeps one level within a quad's reach (${(Math.max(...levels) - Math.min(...levels)).toFixed(2)} m)`);
  }
  const rows = 22;
  // a table wall of the mesa stack's steepness (0.9–1.2:1 — the round-47 approach rose at up to 1.25:1)
  const ring = syntheticRing(rows, (a, r) => 50 + 360 * Math.min(1, Math.max(0, (r - 860) / 300)) * (0.75 + 0.25 * Math.sin(a * 4)));
  const before = ring.heights.slice();
  const floors = new Float32Array(rows).fill(40), weights = new Float32Array(rows);
  for (let row = 2; row < rows; row++) weights[row] = 1;
  carveEscarpmentRing({ columns: n, rowCount: rows, positions: ring.positions, heights: ring.heights, floors, weights }, field, { talusFill: 0.34 });
  let tiers = 0;
  for (let k = 0; k < n; k++) {
    let bench = false, cliff = false;
    for (let row = 1; row < rows; row++) {
      const i = row * n + k, j = i - n;
      const gap = Math.hypot(ring.positions[i * 3], ring.positions[i * 3 + 2]) - Math.hypot(ring.positions[j * 3], ring.positions[j * 3 + 2]);
      const slope = (ring.heights[i] - ring.heights[j]) / gap;
      if (weights[row] > 0) assert.ok(Math.abs(slope) <= 3.601, `no cliff past 3.6:1 between rows (${slope.toFixed(2)})`);
      if (slope > 1.4) cliff = true; else if (slope < 0.6 && slope > -0.2) bench = true;
    }
    if (bench && cliff) tiers++;
    for (let row = 0; row < 2; row++) assert.equal(ring.heights[row * n + k], before[row * n + k], 'a weightless row is untouched by the stair');
  }
  assert.ok(tiers > n * 0.5, `the ramp became tiers at most columns (${tiers} of ${n})`);
}

// --- every map: the passes move heights only — the same rows, the same plan positions, the same triangle budget ----
for (const id of MAP_IDS) {
  const config = getMapConfig(id);
  const ring = sampleHorizonGeometry(config, 1337);
  const plain = sampleHorizonGeometry({ ...config, horizon: { ...config.horizon, massif: false, escarpment: false } }, 1337);
  assert.equal(ring.rows.length, plain.rows.length, `${id}: the lane adds no row (the triangle budget is the ring's own)`);
  assert.equal(ring.positions.length, plain.positions.length, `${id}: the same vertex count`);
  for (let i = 0; i < ring.heights.length; i++) assert.ok(Number.isFinite(ring.heights[i]), `${id}: finite heights`);
}

// --- the cone measure: the skyline the battlefield sees, and its straight-flanked summits ---------------------------
// (the round-72b profile stood every massif at the same azimuth on every row, so a range was a radial spur, and a spur
// seen end-on is a smooth triangle — a cone in the skyline, not in any one row. The measure projects the ring from five
// eye points inside the square (the centre and four 350 m out, 30 m up) into 1440 azimuth bins of elevation angle, and
// counts the summits of 1.5 degrees' prominence whose two flanks fit straight lines (R2 > 0.985 over their top 60 %)
// with slopes within 30 % of each other; the round-72b ring (massif: false) is the negative control.)
function skylineCones(ring) {
  const BINS = 1440, eyes = [[0, 0], [350, 0], [-350, 0], [0, 350], [0, -350]];
  let summits = 0, straight = 0; const scores = [];
  for (const [ex, ez] of eyes) {
    const sky = new Float64Array(BINS).fill(-Math.PI / 2);
    for (let i = n * 2; i < ring.heights.length; i++) {
      const dx = ring.positions[i * 3] - ex, dz = ring.positions[i * 3 + 2] - ez;
      const dist = Math.hypot(dx, dz);
      const bin = Math.floor(((Math.atan2(dz, dx) / (Math.PI * 2)) + 1) % 1 * BINS) % BINS;
      const elevation = Math.atan2(ring.heights[i] - 30, dist);
      if (elevation > sky[bin]) sky[bin] = elevation;
    }
    // fill empty bins from their neighbours (a vertex lands in roughly every third bin at 1.4 km)
    for (let pass = 0; pass < 4; pass++) for (let b = 0; b < BINS; b++) if (sky[b] <= -1.5) sky[b] = Math.max(sky[(b + BINS - 1) % BINS], sky[(b + 1) % BINS]);
    const deg = Array.from(sky, (v) => v * 180 / Math.PI);
    for (let b = 0; b < BINS; b++) {
      let isMax = true;
      for (let d = -6; d <= 6; d++) if (d && deg[(b + d + BINS) % BINS] > deg[b]) { isMax = false; break; }
      if (!isMax) continue;
      const flank = (dir) => {
        const ys = [];
        for (let d = 1; d < 120; d++) { const v = deg[(b + dir * d + BINS) % BINS]; if (v > deg[(b + dir * (d - 1) + BINS) % BINS] + 1e-9) break; ys.push(v); }
        return ys;
      };
      const L = flank(-1), R = flank(1);
      const prominence = deg[b] - Math.max(Math.min(...L, deg[b]), Math.min(...R, deg[b]));
      if (prominence < 1.5) continue;
      summits++;
      const fit = (ys) => {
        const top = []; for (const v of ys) { if (v < deg[b] - prominence * 0.6) break; top.push(v); }
        const m = top.length;
        if (m < 6) return { r2: 0, slope: 0 };
        const mx = (m + 1) / 2, my = top.reduce((p, q) => p + q) / m;
        let sxy = 0, sxx = 0, syy = 0;
        for (let j = 0; j < m; j++) { sxy += (j + 1 - mx) * (top[j] - my); sxx += (j + 1 - mx) ** 2; syy += (top[j] - my) ** 2; }
        return { r2: syy > 0 ? sxy * sxy / (sxx * syy) : 0, slope: Math.abs(sxy / sxx) };
      };
      const a = fit(L), c = fit(R);
      const coneScore = Math.min(a.r2, c.r2) * Math.min(a.slope, c.slope) / Math.max(1e-9, Math.max(a.slope, c.slope));
      scores.push(coneScore);
      if (Math.min(a.r2, c.r2) > 0.985 && Math.min(a.slope, c.slope) / Math.max(1e-9, Math.max(a.slope, c.slope)) > 0.7) straight++;
    }
  }
  scores.sort((p, q) => q - p);
  return { summits, straight, top: scores.slice(0, 8).map((v) => +v.toFixed(2)), over80: scores.filter((v) => v > 0.8).length, over70: scores.filter((v) => v > 0.7).length };
}
const coneReport = {};
for (const id of ['winter', 'frontier', 'whiteout', 'alpine', 'fjord', 'caldera']) {
  const config = getMapConfig(id);
  let carved = { summits: 0, straight: 0 }, plain = { summits: 0, straight: 0 };
  for (const seed of [1337, 2049, 7719]) {
    const a = skylineCones(sampleHorizonGeometry(config, seed));
    const b = skylineCones(sampleHorizonGeometry({ ...config, horizon: { ...config.horizon, massif: false } }, seed));
    carved = { summits: carved.summits + a.summits, straight: carved.straight + a.straight, over80: (carved.over80 ?? 0) + a.over80, over70: (carved.over70 ?? 0) + a.over70, top: a.top };
    plain = { summits: plain.summits + b.summits, straight: plain.straight + b.straight, over80: (plain.over80 ?? 0) + b.over80, over70: (plain.over70 ?? 0) + b.over70, top: b.top };
  }
  coneReport[id] = { carved, plain };
}
console.log(JSON.stringify(coneReport));
