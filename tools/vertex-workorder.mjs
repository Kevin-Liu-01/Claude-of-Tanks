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
    const GS = 1024;
    const trace = (mask, cam, N = 96) => {
      const S = Math.round(Math.sqrt(mask.length));
      const half = cam.right; const out = []; const step = S / N;
      for (let c = 0; c < N; c++) {
        const x0 = Math.floor(c * step); const x1 = Math.min(S, Math.floor((c + 1) * step));
        let top = -1; let bot = -1;
        for (let x = x0; x < x1; x++) {
          for (let y = S - 1; y >= 0; y--) if (mask[y * S + x]) { if (y > top) top = y; break; }
          for (let y = 0; y < S; y++) if (mask[y * S + x]) { if (bot < 0 || y < bot) bot = y; break; }
        }
        out.push(top >= 0 ? [((x0 + x1) / 2 + 0.5) / S * 2 * half - half,
          ((top + 0.5) / S * 2 - 1) * half, ((bot + 0.5) / S * 2 - 1) * half] : null);
      }
      return out;
    };
    // camera-frame -> world per view (cameraFor conventions):
    //   side: at=-(z-Cz) v=y-Cy | plan: at=x-Cx v=-(z-Cz) | front: at=x-Cx v=y-Cy
    const toWorld = {
      side: (p) => [C.z - p[0], p[1] + C.y, p[2] + C.y],
      plan: (p) => [p[0] + C.x, C.z - p[2], C.z - p[1]], // [x, zFront(max), zRear(min)]
      front: (p) => [p[0] + C.x, p[1] + C.y, p[2] + C.y],
    };
    const out = { center: [C.x, C.y, C.z].map((v) => +v.toFixed(3)), rows: {} };
    const big = { side: 512, plan: 512, front: 512 };
    for (const view of ['side', 'plan', 'front']) {
      const cam = cameraFor(AXES[view]);
      for (const part of ['whole', 'hull', 'turret']) {
        if (part === 'turret' && view === 'front') continue;
        const rm = trace(renderMask(reference, procedural, cam, part), cam);
        const pm = trace(renderMask(procedural, reference, cam, part), cam);
        const rows = [];
        for (let i = 0; i < 96; i++) {
          const r = rm[i]; const p = pm[i];
          if (!r && !p) continue;
          const w = r ? toWorld[view](r) : null;
          const q = p ? toWorld[view](p) : null;
          rows.push({
            u: +( (r || p)[0] ).toFixed(3),
            world: w ? w.map((v) => +v.toFixed(3)) : null,
            proc: q ? q.map((v) => +v.toFixed(3)) : null,
            err: (r && p) ? +((Math.abs(r[1] - p[1]) + Math.abs(r[2] - p[2])) / 2).toFixed(3) : null,
            only: r && !p ? 'ref' : (!r && p ? 'proc' : null),
          });
        }
        out.rows[`${view}_${part}`] = rows;
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
