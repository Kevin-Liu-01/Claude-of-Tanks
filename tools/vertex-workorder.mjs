#!/usr/bin/env node
// tools/vertex-workorder.mjs — VERTEX-ROUND builder digest: one headless run
// of the gate page per tank, dumping BOTH models' 96-column curves for every
// scored row (side/plan/front x whole/hull + side/plan turret) in ABSOLUTE
// WORLD coordinates (camera-frame 'at' converted via the shared-box center),
// plus per-column error lists sorted worst-first. The gate's own JSON stays
// the score of record; this is the work order with real z/x values a builder
// can author against directly.
// READ-ONLY probe: no harness files touched. Own 74xx-77xx vite.
// Usage: node tools/vertex-workorder.mjs --id=t64bv1 [--rows=side_whole,...]
//        [--top=14] (worst columns per row)
import { createServer } from 'vite';
import puppeteer from 'puppeteer';

const ROOT = process.cwd();
const id = (process.argv.find((a) => a.startsWith('--id=')) || '--id=t64bv1').slice(5);
const topN = Number((process.argv.find((a) => a.startsWith('--top=')) || '--top=14').slice(6));
const rowsArg = process.argv.find((a) => a.startsWith('--rows='));
const onlyRows = rowsArg ? rowsArg.slice(7).split(',') : null;

const server = await createServer({
  root: ROOT, logLevel: 'error',
  server: { port: 7600 + Math.floor(Math.random() * 100), strictPort: false, hmr: false, watch: null },
});
await server.listen();
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
page.setDefaultTimeout(180000);
try {
  await page.goto(`http://localhost:${server.config.server.port}/tools/procedural-fidelity.html?id=${id}&geo=1`,
    { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__FIDELITY_READY === true', { polling: 60 });
  try {
    const { readFileSync } = await import('node:fs');
    const vx = readFileSync(`docs/references/vertex/${id}.json`, 'utf8');
    await page.evaluate((s) => { window.__VERTEX_JSON = s; }, vx);
  } catch { /* no extract for this id — plan rows use the legacy center */ }
  const res = await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { reference, procedural, renderMask, cameraFor } = window.__FIDELITY_DEBUG;
    // shared-box center: same recipe as the harness (visibleBox union —
    // shadow proxies EXCLUDED like the harness's isShadowHelper filter;
    // procShadow_gun once shifted every printed z by +0.68)
    const vb = (root) => {
      const b = new THREE.Box3();
      const g = new THREE.Box3();
      root.updateMatrixWorld(true);
      root.traverse((o) => {
        if (!o.isMesh || !o.geometry || /shadow/i.test(o.name || '')) return;
        let vis = true;
        for (let p2 = o; p2; p2 = p2.parent) if (!p2.visible) { vis = false; break; }
        if (!vis) return;
        g.setFromObject(o);
        if (!g.isEmpty()) b.union(g);
      });
      return b;
    };
    const shared = vb(reference.root).union(vb(procedural.root));
    const C = shared.getCenter(new THREE.Vector3());
    const AXES = { side: new THREE.Vector3(1, 0, 0), plan: new THREE.Vector3(0, 1, 0), front: new THREE.Vector3(0, 0, 1) };
    const planZOff = { mode: 'legacy', off: 0 };
    const GS = 1024;
    const scanColumn = (mask, size, x0, x1) => {
      let top = -1;
      let bot = -1;
      for (let x = x0; x < x1; x++) {
        for (let y = size - 1; y >= 0; y--) {
          if (!mask[y * size + x]) continue;
          if (y > top) top = y;
          break;
        }
        for (let y = 0; y < size; y++) {
          if (!mask[y * size + x]) continue;
          if (bot < 0 || y < bot) bot = y;
          break;
        }
      }
      return { top, bot };
    };
    const trace = (mask, cam, N = 96) => {
      const S = Math.round(Math.sqrt(mask.length));
      const half = cam.right; const out = []; const step = S / N;
      for (let c = 0; c < N; c++) {
        const x0 = Math.floor(c * step); const x1 = Math.min(S, Math.floor((c + 1) * step));
        const { top, bot } = scanColumn(mask, S, x0, x1);
        out.push(top >= 0 ? [((x0 + x1) / 2 + 0.5) / S * 2 * half - half,
          ((top + 0.5) / S * 2 - 1) * half, ((bot + 0.5) / S * 2 - 1) * half] : null);
      }
      return out;
    };
    // camera-frame -> world per view (cameraFor conventions):
    //   side: at=-(z-Cz) v=y-Cy | plan: at=x-Cx v=-(z-Cz) | front: at=x-Cx v=y-Cy
    // SELF-CALIBRATED vertical: both models touch ground (y=0), so per view
    // the minimum whole-mask bottom defines the v->world offset exactly —
    // no camera-center guessing (two prior conventions each fit only one
    // view; this closes the question for good).
    const minimumTraceBottom = (traceColumns) => {
      let minimum = Infinity;
      for (const column of traceColumns) {
        if (column && column[2] < minimum) minimum = column[2];
      }
      return minimum;
    };
    const groundOffsetForView = (view) => {
      const camera = cameraFor(AXES[view]);
      const columns = trace(renderMask(reference, procedural, camera, 'whole'), camera);
      const minimum = minimumTraceBottom(columns);
      return Number.isFinite(minimum) ? -minimum : 0;
    };
    const yOff = {
      side: groundOffsetForView('side'),
      front: groundOffsetForView('front'),
      plan: 0,
    };
    // plan calibration: the plan 'vertical' is world-z on screen; anchor the
    // REF hull-mask REAR edge to the extract's known hullMask.z0 (ground
    // truth, same spirit as the side/front ground anchor).
    // r3 FIX (t72bu phantom basket): the old orientation pick compared span
    // ENDPOINTS against the muzzle target — DEGENERATE, since a contiguous
    // mask maps its extremes to the same two values under both modes; ±1px
    // jitter decided the branch and a flipped run printed the ref turret
    // rear at z −3.2 (direct mask dump: it ends at −1.55). Orientation now
    // comes from the THIN-END test on the whole mask (the end held by the
    // gun tube alone — few columns — is the FRONT), and the offset from the
    // HULL trace (whole-mask rear can overhang the hull rear).
    const traceExtents = (columns) => {
      let minimum = Infinity;
      let maximum = -Infinity;
      for (const column of columns) {
        if (!column) continue;
        if (column[2] < minimum) minimum = column[2];
        if (column[1] > maximum) maximum = column[1];
      }
      return { minimum, maximum };
    };
    const referencePlanDatums = () => {
      try {
        const vertex = JSON.parse(window.__VERTEX_JSON || 'null');
        const z0 = vertex?.measured?.hullMask?.z0 ?? null;
        const gunBox = vertex?.landmarks?.gunBox;
        const z1 = gunBox ? gunBox.hi[2] : (vertex?.measured?.hullMask?.z1 ?? null);
        return { z0, z1 };
      } catch {
        return { z0: null, z1: null };
      }
    };
    const thinEndCounts = (columns, minimum, maximum) => {
      const near = 0.40;
      let nearMinimum = 0;
      let nearMaximum = 0;
      for (const column of columns) {
        if (!column) continue;
        if (column[2] <= minimum + near) nearMinimum++;
        if (column[1] >= maximum - near) nearMaximum++;
      }
      return { nearMinimum, nearMaximum };
    };
    const calibratePlanZOffset = () => {
      const cam0 = cameraFor(AXES.plan);
      const t0 = trace(renderMask(reference, procedural, cam0, 'whole'), cam0);
      const t0h = trace(renderMask(reference, procedural, cam0, 'hull'), cam0);
      const whole = traceExtents(t0);
      const hull = traceExtents(t0h);
      const { z0, z1 } = referencePlanDatums();
      if (z0 !== null && Number.isFinite(whole.minimum)
        && Number.isFinite(whole.maximum) && Number.isFinite(hull.minimum)) {
        const counts = thinEndCounts(t0, whole.minimum, whole.maximum);
        if (counts.nearMinimum !== counts.nearMaximum) {
          // thin end = muzzle = front (max z). mode B maps v=mn -> z max.
          planZOff.mode = counts.nearMinimum < counts.nearMaximum ? 'B' : 'A';
        } else {
          // symmetric fallback (gunless mask): old endpoint-vs-target pick
          const frontA = (z0 - hull.minimum) + whole.maximum;
          const frontB = (z0 + hull.maximum) - whole.minimum;
          const target = z1 !== null ? z1 : (z0 + (whole.maximum - whole.minimum));
          planZOff.mode = Math.abs(frontA - target) <= Math.abs(frontB - target) ? 'A' : 'B';
        }
        planZOff.off = planZOff.mode === 'A' ? (z0 - hull.minimum) : (z0 + hull.maximum);
      } else { planZOff.mode = 'legacy'; planZOff.off = C.z; }
    };
    calibratePlanZOffset();
    const toWorld = {
      side: (p) => [C.z - p[0], p[1] + yOff.side, p[2] + yOff.side],
      plan: (p) => planZOff.mode === 'A'
        ? [p[0] + C.x, planZOff.off + p[1], planZOff.off + p[2]]  // [x, zFront, zRear]
        : [p[0] + C.x, planZOff.off - p[2], planZOff.off - p[1]],
      front: (p) => [p[0] + C.x, p[1] + yOff.front, p[2] + yOff.front],
    };
    const sampledRow = (view, referenceColumn, proceduralColumn) => {
      const world = referenceColumn ? toWorld[view](referenceColumn) : null;
      const proc = proceduralColumn ? toWorld[view](proceduralColumn) : null;
      return {
        u: +((referenceColumn || proceduralColumn)[0]).toFixed(3),
        world: world ? world.map((value) => +value.toFixed(3)) : null,
        proc: proc ? proc.map((value) => +value.toFixed(3)) : null,
        err: (referenceColumn && proceduralColumn)
          ? +((Math.abs(referenceColumn[1] - proceduralColumn[1])
            + Math.abs(referenceColumn[2] - proceduralColumn[2])) / 2).toFixed(3)
          : null,
        only: referenceColumn && !proceduralColumn
          ? 'ref' : (!referenceColumn && proceduralColumn ? 'proc' : null),
      };
    };
    const sampledRows = (view, referenceMask, proceduralMask) => {
      const rows = [];
      for (let i = 0; i < 96; i++) {
        const referenceColumn = referenceMask[i];
        const proceduralColumn = proceduralMask[i];
        if (!referenceColumn && !proceduralColumn) continue;
        rows.push(sampledRow(view, referenceColumn, proceduralColumn));
      }
      return rows;
    };
    const out = { center: [C.x, C.y, C.z].map((v) => +v.toFixed(3)), rows: {} };
    for (const view of ['side', 'plan', 'front']) {
      const cam = cameraFor(AXES[view]);
      for (const part of ['whole', 'hull', 'turret']) {
        if (part === 'turret' && view === 'front') continue;
        const rm = trace(renderMask(reference, procedural, cam, part), cam);
        const pm = trace(renderMask(procedural, reference, cam, part), cam);
        out.rows[`${view}_${part}`] = sampledRows(view, rm, pm);
      }
    }
    // restore whole visibility for cleanliness
    window.__FIDELITY_DEBUG.setPart(reference.root, 'whole');
    window.__FIDELITY_DEBUG.setPart(procedural.root, 'whole');
    return out;
  });
  // note: raw per-column dump uses UNREGISTERED curves — the gate applies a
  // hull-anchored translation before scoring. The digest below re-derives the
  // same registration (body-span midpoints of the hull rows, dy mean) so the
  // printed errors match the gate's frame.
  const bodySpanMid = (rows, key) => {
    const cols = rows.filter((r) => r[key]);
    if (!cols.length) return null;
    const band = (r) => (key === 'world' ? Math.abs(r.world[1] - r.world[2]) : Math.abs(r.proc[1] - r.proc[2]));
    const rough = Math.max(...cols.map(band));
    const body = cols.filter((r) => band(r) > rough * 0.12);
    const arr = body.length ? body : cols;
    return (arr[0].u + arr[arr.length - 1].u) / 2;
  };
  for (const [name, rows] of Object.entries(res.rows)) {
    if (onlyRows && !onlyRows.includes(name)) continue;
    const view = name.split('_')[0];
    const hull = res.rows[`${view}_hull`];
    const dAlong = (bodySpanMid(hull, 'world') ?? 0) - (bodySpanMid(hull, 'proc') ?? 0);
    // dy: mean band-center delta over overlapping columns (approx of gate)
    let dySum = 0; let dyN = 0;
    for (const r of rows) {
      if (!r.world || !r.proc) continue;
      dySum += ((r.world[1] + r.world[2]) - (r.proc[1] + r.proc[2])) / 2; dyN++;
    }
    const dy = dyN ? dySum / dyN : 0;
    const scored = rows.map((r) => {
      if (!r.world || !r.proc) return { ...r, gerr: r.only ? 9 : 0 };
      const e = (Math.abs(r.world[1] - (r.proc[1] + dy)) + Math.abs(r.world[2] - (r.proc[2] + dy))) / 2;
      return { ...r, gerr: +e.toFixed(3) };
    }).sort((a, b) => b.gerr - a.gerr).slice(0, topN);
    console.log(`\n== ${name} (dy ${dy.toFixed(3)} dAlong ${dAlong.toFixed(3)}) worst ${topN}:`);
    for (const r of scored) {
      const axis = view === 'plan' ? 'x' : 'z';
      const pos = view === 'side' ? (r.world || r.proc)[0] : (r.world || r.proc)[0];
      console.log(`  ${axis}=${String(pos).padStart(7)}  ref ${r.world ? `${r.world[1]}..${r.world[2]}` : 'NONE'}`
        + `  proc ${r.proc ? `${r.proc[1]}..${r.proc[2]}` : 'NONE'}  err ${r.gerr}${r.only ? ` ONLY-${r.only.toUpperCase()}` : ''}`);
    }
  }
  console.log(`\ncenter ${JSON.stringify(res.center)}`);
} finally {
  await browser.close();
  await server.close();
}
