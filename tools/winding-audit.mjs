import { acquireCaptureLock as acquireLock, refreshCaptureLock, releaseCaptureLock as releaseLock } from './capture-lock.mjs';
// RENDER-TRUTH AUDIT driver (BUILD-STANDARD §C.1, owner order 2026-08-06;
// law banked 1017339, yaw-stranded amendment 8e1de63). Official fleet tool:
// drives tools/winding-audit.html per procedural-source id and reports
//   MODE 1a  winding census        — REVERSED / MIXED connected pieces
//                                    (mesh census + KIT.slab call sites)
//   MODE 1b  render deficit        — FrontSide (game truth) vs DoubleSide
//                                    (gate truth) silhouettes, 8 compass
//                                    views + top; deficitPx = pixels the
//                                    gate sees that the game does not
//   MODE 2   yaw-stranded audit    — rest / yaw-90 / yaw-180 pixel-static
//                                    mass in the turret plan footprint;
//                                    CANDIDATES (adjudicate), never defects
//                                    (§J same-camo static-pixel false-flag
//                                    law; id-pass + vertex census attached)
// Usage:
//   node tools/winding-audit.mjs                    # full procedural fleet
//   node tools/winding-audit.mjs --ids=a,b,c        # subset (no-spec ids skip)
//   node tools/winding-audit.mjs --views=left,right # mode-1 view filter
//   node tools/winding-audit.mjs --size=768         # render size
//   node tools/winding-audit.mjs --check            # exit 2 if any HARD flag
// Output: shots/winding-audit.json (ranked worst-first). This tool NEVER
// writes ledger rows — it is an audit, not the gate. Vite on 74xx-77xx
// (owner keeps 5001). FIFO §F.1: cot-shots lock shared with the capture
// harnesses, SELF-TICKETING, and per the §C.1 amendment the lock is taken
// PER TANK (one ticket per tank) so live lanes interleave with fleet runs.
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync } from 'node:fs';

// ---- cot-shots FIFO lock (track-clip-audit protocol: 15-digit tickets) ----

process.on('exit', releaseLock);
const refresher = setInterval(() => { refreshCaptureLock(); }, 60 * 1000);
refresher.unref();

// ---- CLI ----
const arg = (k) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
const idArg = arg('ids');
const viewsArg = arg('views');
const sizeArg = arg('size');
const CHECK = process.argv.includes('--check');

// ---- HARD/flag thresholds (calibrated 2026-08-06 on the validation set:
// ariete/leclerc clean controls read <=51 px / <=0.09% deficit and 0 yaw
// candidates; the real one-sided remnants on t80u/challenger1 read ~200 px /
// 0.31-0.33%; t72b3m (owner case) reads 11227 yaw-candidate px vs <=72 on
// every negative control) ----
const DEF_HARD_FRAC = 0.02;    // worst-view deficit >= 2% of the gate silhouette
const DEF_FLAG_FRAC = 0.0025;  // >= 0.25% (t80u/challenger1 class ~0.31%)
const DEF_MIN_PX = 100;        // absolute speckle floor at 768^2
const YAW_HARD_PX = 900;       // adjudication-candidate pixels (768^2 top view)
const YAW_FLAG_PX = 250;
const scalePx = (S) => (S * S) / (768 * 768);

const server = await createServer({
  root: process.cwd(), logLevel: 'error',
  server: { port: 7530 + Math.floor(Math.random() * 60), strictPort: false, hmr: false, watch: { ignored: ['**/*'] } },
});
await server.listen();
const port = server.config.server.port;
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
page.setDefaultTimeout(240000);
let lastPageError = null;
page.on('pageerror', (e) => { lastPageError = e.message; });

const results = [];
const S = Math.max(256, Math.min(1024, Number(sizeArg) || 768));
const pxScale = scalePx(S);
const verdictOf = (r) => {
  if (r.skipped) return 'skip';
  const rev = r.census?.reversed ?? 0;
  const mix = r.census?.mixed ?? 0;
  const dfrac = r.deficit?.worstViewDeficitFrac ?? 0;
  const dpx = r.deficit?.worstViewDeficit ?? 0;
  const ypx = r.yaw?.candidatePx ?? 0;
  // census REVERSED with zero deficit = latent (occluded inner cores, the
  // merkava4 calibration read): a law violation worth a flag, HARD only
  // once it also shows in a FrontSide render.
  let m1 = 'clean';
  const defFlag = dfrac >= DEF_FLAG_FRAC && dpx >= DEF_MIN_PX * pxScale;
  const defHard = dfrac >= DEF_HARD_FRAC && dpx >= DEF_MIN_PX * pxScale;
  if (defHard || (rev >= 1 && defFlag)) m1 = 'HARD';
  else if (rev > 0 || mix > 0 || defFlag) m1 = 'flag';
  let m2 = 'clean';
  if (ypx >= YAW_HARD_PX * pxScale) m2 = 'HARD';
  else if (ypx >= YAW_FLAG_PX * pxScale) m2 = 'candidates';
  return { m1, m2 };
};

try {
  let ids;
  if (idArg) {
    ids = idArg.split(',').map((s) => s.trim()).filter(Boolean);
  } else {
    await page.goto(`http://localhost:${port}/tools/winding-audit.html?mode=list`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction('window.__WIND_READY === true', { polling: 50 });
    ids = (await page.evaluate('window.__WIND_RESULT')).ids;
  }
  console.log(`[winding-audit] auditing ${ids.length} ids (size ${S}${viewsArg ? `, views ${viewsArg}` : ''})`);
  for (const id of ids) {
    // one FIFO ticket per tank (§C.1 amendment): live lanes interleave
    await acquireLock(45 * 60 * 1000);
    try {
      lastPageError = null;
      const qs = [`id=${encodeURIComponent(id)}`, `size=${S}`];
      if (viewsArg) qs.push(`views=${encodeURIComponent(viewsArg)}`);
      await page.goto(`http://localhost:${port}/tools/winding-audit.html?${qs.join('&')}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction('window.__WIND_READY === true', { polling: 50 });
      const r = await page.evaluate('window.__WIND_RESULT');
      if (lastPageError && !r) throw new Error(lastPageError);
      results.push(r);
      if (r.skipped) {
        console.log(`[winding-audit] ${id.padEnd(18)} SKIP ${r.skipped}`);
      } else {
        const v = verdictOf(r);
        const c = r.census;
        const d = r.deficit;
        const yv = r.yaw;
        const yawCol = yv?.skipped
          ? `yaw skip(${yv.skipped})`
          : `yaw cand ${String(yv.candidatePx).padStart(6)} static ${String(yv.staticPx).padStart(6)} coinc ${String(yv.coincidencePx).padStart(6)}`;
        const top = yv?.candidates?.[0];
        console.log(`[winding-audit] ${id.padEnd(18)} rev ${String(c.reversed).padStart(3)} mix ${String(c.mixed).padStart(3)} calls ${String(r.slabCalls.flaggedCalls).padStart(3)} | deficit ${String(d.worstViewDeficit).padStart(6)}px ${(100 * d.worstViewDeficitFrac).toFixed(2).padStart(6)}% @${(d.worstView || '-').padEnd(10)} | ${yawCol} | m1 ${v.m1} m2 ${v.m2}${top ? ` | top ${top.rig}/${top.node}(${top.px})` : ''}`);
      }
    } catch (e) {
      results.push({ id, error: (lastPageError || e.message).slice(0, 200) });
      console.log(`[winding-audit] ${id.padEnd(18)} ERROR ${(lastPageError || e.message).slice(0, 120)}`);
    } finally {
      releaseLock();
    }
  }

  // ---- ranked report + JSON ----
  const ok = results.filter((r) => !r.error && !r.skipped);
  for (const r of ok) r.verdict = verdictOf(r);
  const byDeficit = [...ok].sort((a, b) => (b.deficit.worstViewDeficitFrac - a.deficit.worstViewDeficitFrac)
    || (b.census.reversed + b.census.mixed) - (a.census.reversed + a.census.mixed));
  const byYaw = [...ok].filter((r) => !r.yaw?.skipped).sort((a, b) => (b.yaw.candidatePx ?? 0) - (a.yaw.candidatePx ?? 0));

  console.log('\n[winding-audit] ===== MODE 1 ranked (FrontSide-vs-DoubleSide deficit, worst first) =====');
  console.log('[winding-audit] id                 rev mix  worst-view      deficitPx  deficit%  verdict');
  for (const r of byDeficit) {
    console.log(`[winding-audit] ${r.id.padEnd(18)} ${String(r.census.reversed).padStart(3)} ${String(r.census.mixed).padStart(3)}  ${(r.deficit.worstView || '-').padEnd(14)} ${String(r.deficit.worstViewDeficit).padStart(9)} ${(100 * r.deficit.worstViewDeficitFrac).toFixed(2).padStart(9)}  ${r.verdict.m1}`);
  }
  console.log('\n[winding-audit] ===== MODE 2 ranked (yaw-stranded candidates (adjudicate), worst first) =====');
  console.log('[winding-audit] id                 candidatePx staticPx coincPx  top candidate                verdict');
  for (const r of byYaw) {
    const top = r.yaw.candidates?.[0];
    console.log(`[winding-audit] ${r.id.padEnd(18)} ${String(r.yaw.candidatePx).padStart(11)} ${String(r.yaw.staticPx).padStart(8)} ${String(r.yaw.coincidencePx).padStart(7)}  ${(top ? `${top.rig}/${top.node}(${top.px})` : '-').padEnd(28)} ${r.verdict.m2}`);
  }

  mkdirSync('shots', { recursive: true });
  writeFileSync('shots/winding-audit.json', JSON.stringify({
    generated: new Date().toISOString(),
    size: S,
    views: viewsArg || 'all',
    note: 'BUILD-STANDARD §C.1 render-truth audit. Mode 1: REVERSED/MIXED = closed connected pieces wound inside-out/partially (invisible or holed in every FrontSide render, fully visible to the gate DoubleSide masks); deficitPx = per-view pixels the gate silhouette has that the game render lacks (catches ANY game-vs-gate divergence, incl. open one-sided planes the census cannot classify). REVERSED with deficit 0 = latent occluded core (merkava4 class). slabCalls are call-site ATTRIBUTION HINTS via the leftprobe centroid heuristic — it misfires on concave/tall rings (type90/leo2_revolution calibration); the mesh census (edge balance + signed volume) is authoritative. Mode 2 (amendment 8e1de63): yaw-stranded CANDIDATES (adjudicate, never automatic defects) — pixel-static mass across turret yaw 0/90/180 inside the ring-centered plan disc at h >= ringY+0.20 (engine decks sit at/just above ring height fleet-wide; deck band counted as deckStaticPx), id-attributed; turret-subtree/same-camo statics = coincidencePx (§J false-flag law); vertex census per candidate. Merkava tail packs are the documented ORACLE-REGISTRATION-PINNED certified class — adjudicate as certified when flagged. NEVER a ledger writer; census reflects the live tree at generation time.',
    thresholds: { DEF_HARD_FRAC, DEF_FLAG_FRAC, DEF_MIN_PX, YAW_HARD_PX, YAW_FLAG_PX },
    rankedByDeficit: byDeficit.map((r) => r.id),
    rankedByYaw: byYaw.map((r) => r.id),
    tanks: results,
  }, null, 1));
  const hard = ok.filter((r) => r.verdict.m1 === 'HARD' || r.verdict.m2 === 'HARD');
  const errs = results.filter((r) => r.error);
  console.log(`\n[winding-audit] ${ok.length} audited, ${results.filter((r) => r.skipped).length} skipped, ${errs.length} errors; HARD: ${hard.length} (${hard.map((r) => r.id).join(', ') || 'none'}) -> shots/winding-audit.json`);
  if (CHECK && hard.length) process.exitCode = 2;
  if (errs.length) process.exitCode = process.exitCode || 1;
} finally {
  await browser.close();
  await server.close();
  releaseLock();
}
