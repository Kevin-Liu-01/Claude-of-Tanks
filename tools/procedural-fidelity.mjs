// Quantitative, repeatable comparison between every locally sourced tank and
// the procedural visual that remains when the GLB is unavailable. The page
// renders normalized binary masks from four orthographic angles and reports
// overlap for the whole vehicle, hull, upper assembly, gun overhang and track
// profile. This is a QA oracle only; no source vertices enter game code.
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';
import puppeteer from 'puppeteer';

const ROOT = process.cwd();
const REPORT_DIR = path.join(ROOT, '.qa-dev', 'reports');
const args = process.argv.slice(2);
const option = (name, fallback = null) => {
  const eq = args.find((arg) => arg.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const requested = option('ids')?.split(',').map((id) => id.trim()).filter(Boolean) || null;
const shotCount = Math.max(0, Number(option('shots', '0')) || 0);
const BOARD = args.includes('--board'); // per-id shaded + articulation boards
const COMPONENTS = args.includes('--components'); // expanded hull/turret mask diagnostics
const CHECK = args.includes('--check');
const PASS = 90;
const VIEW_FLOOR = 90;
const rows = [];
const browserErrors = [];
const metric = (value) => Number.isFinite(value) ? value.toFixed(0) : 'NA';

const server = await createServer({
  root: ROOT,
  logLevel: 'error',
  server: { port: 6700 + Math.floor(Math.random() * 220), strictPort:false, hmr:false, watch:null },
});
await server.listen();
const browser = await puppeteer.launch({
  headless:'new',
  args:['--use-gl=angle','--enable-webgl','--no-sandbox','--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.setViewport({ width:1500, height:800, deviceScaleFactor:1 });
page.setDefaultTimeout(90000);
page.on('pageerror', (error) => browserErrors.push(String(error)));
page.on('console', (message) => {
  const text = message.text();
  if (message.type() === 'error' && !text.includes('favicon')) browserErrors.push(text);
  if (text.includes('glb swap failed')) browserErrors.push(text);
});

const urlFor = (id) => `http://localhost:${server.config.server.port}/tools/procedural-fidelity.html?id=${encodeURIComponent(id)}${COMPONENTS ? '&components=1' : ''}`;
try {
  await page.goto(urlFor(requested?.[0] || 'm1a2'), { waitUntil:'domcontentloaded', timeout:90000 });
  await page.waitForFunction('Array.isArray(window.__REFERENCE_IDS)', { timeout:90000 });
  const discovered = await page.evaluate('window.__REFERENCE_IDS');
  const ids = requested || discovered;

  for (let index=0; index<ids.length; index++) {
    const id = ids[index];
    const errorStart = browserErrors.length;
    try {
      await page.goto(urlFor(id), { waitUntil:'domcontentloaded', timeout:90000 });
      await page.waitForFunction(
        'window.__FIDELITY_SOURCE_PATH !== undefined || typeof window.__FIDELITY_ERROR === "string"',
        { timeout:5000, polling:30 },
      );
      const sourcePath = await page.evaluate('window.__FIDELITY_SOURCE_PATH');
      if (sourcePath?.startsWith('/')) {
        const sourceFile = path.join(ROOT, 'public', sourcePath.replace(/^\/+/, ''));
        if (!fs.existsSync(sourceFile)) throw new Error(`${id} reference file is unavailable: ${sourcePath}`);
      }
      await page.waitForFunction(
        'window.__FIDELITY_READY === true || typeof window.__FIDELITY_ERROR === "string"',
        { timeout:90000, polling:60 },
      );
      const runtimeError = await page.evaluate('window.__FIDELITY_ERROR');
      if (runtimeError) throw new Error(runtimeError);
      const row = await page.evaluate('window.__FIDELITY_REPORT');
      const errors = browserErrors.slice(errorStart);
      if (errors.length) row.errors = errors;
      rows.push(row);
      console.log(`[fidelity ${String(index+1).padStart(2)}/${ids.length}] ${id.padEnd(22)} ` +
        `${row.score.toFixed(1)}  H${metric(row.scores.hull)} T${metric(row.scores.turret)} ` +
        `G${metric(row.scores.gun)} R${metric(row.scores.tracks)}`);
    } catch (error) {
      const message = String(error);
      const unavailable = /reference (?:GLB did not load|file is unavailable)|no local GLB reference/.test(message);
      const row = {
        id, name:id, score:unavailable ? null : 0,
        scores:{ overall:null,hull:null,turret:null,gun:null,tracks:null },
        error:message, unavailable,
      };
      rows.push(row);
      console.error(`[fidelity ${String(index+1).padStart(2)}/${ids.length}] ${id}: ${error.message}`);
    }
  }

  rows.sort((a,b) => (a.score ?? Infinity) - (b.score ?? Infinity) || a.id.localeCompare(b.id));
  if (shotCount) {
    const shotDir = path.join(ROOT,'shots','procedural-fidelity');
    fs.mkdirSync(shotDir,{recursive:true});
    for (const row of rows.filter((candidate) => Number.isFinite(candidate.score)).slice(0,shotCount)) {
      await page.goto(urlFor(row.id), { waitUntil:'domcontentloaded', timeout:90000 });
      await page.waitForFunction('window.__FIDELITY_READY === true', { timeout:90000, polling:60 });
      await page.screenshot({ path:path.join(shotDir,`${row.id}.png`), fullPage:true });
    }
  }
  if (BOARD) {
    // BUILD-STANDARD evidence boards: shaded pair + articulation strip +
    // 24-frame turntable, captured at native canvas resolution (wide viewport
    // so the page never downscales the strips).
    const boardDir = path.join(ROOT,'shots','procedural-fidelity','boards');
    fs.mkdirSync(boardDir,{recursive:true});
    await page.setViewport({ width:2520, height:1200, deviceScaleFactor:1 });
    for (const row of rows) {
      if (row.error) continue;
      await page.goto(`${urlFor(row.id)}&board=1`, { waitUntil:'domcontentloaded', timeout:120000 });
      await page.waitForFunction('window.__FIDELITY_READY === true', { timeout:120000, polling:60 });
      await page.screenshot({ path:path.join(boardDir,`${row.id}.png`), fullPage:true });
      console.log(`[board] ${row.id}`);
    }
  }
} finally {
  await browser.close();
  await server.close();
}

const scoredRows = rows.filter((row) => Number.isFinite(row.score));
const scores = scoredRows.map((row) => row.score).sort((a,b)=>a-b);
const median = scores.length ? scores[Math.floor(scores.length/2)] : 0;
const summary = {
  discovered:rows.length,
  references:scoredRows.length,
  unavailable:rows.filter((row)=>row.unavailable).length,
  passed:scoredRows.filter((row)=>row.gatePassed).length,
  failed:scoredRows.filter((row)=>!row.gatePassed).length,
  passThreshold:PASS,
  perViewFloor:VIEW_FLOOR,
  median:Number(median.toFixed(2)),
  worst:scoredRows.toSorted((a,b)=>a.score-b.score)[0]?.id || null,
  best:scoredRows.toSorted((a,b)=>a.score-b.score).at(-1)?.id || null,
};
const report={ generatedAt:new Date().toISOString(),summary,rows };
fs.mkdirSync(REPORT_DIR,{recursive:true});
fs.writeFileSync(path.join(REPORT_DIR,'procedural-fidelity.json'),`${JSON.stringify(report,null,2)}\n`);
const cell = (value) => Number.isFinite(value) ? value.toFixed(1) : 'N/A';
const md=[
  '# Procedural tank fidelity report','',
  `Available local comparison references: **${summary.references}/${summary.discovered}**. `+
    `Passing ${PASS}/100 overall and ${VIEW_FLOOR}/100 in every view: **${summary.passed}**. `+
    `Below target: **${summary.failed}**. Unavailable references: **${summary.unavailable}**. `+
    `Median: **${summary.median.toFixed(1)}**.`,'',
  'Red/cyan mask scoring uses identical normalized poses: 35% whole silhouette, 25% hull, '+
    '20% direct articulated turret tree, 12% cannon overhang, and 8% lower track profile.','',
  '| Tank | Score | Whole | Hull | Turret | Gun | Tracks | Procedural fallback |',
  '|---|---:|---:|---:|---:|---:|---:|---|',
  ...rows.map((row)=>`| ${row.name} (${row.id}) | ${cell(row.score)} | ${cell(row.scores.overall)} | `+
    `${cell(row.scores.hull)} | ${cell(row.scores.turret)} | ${cell(row.scores.gun)} | `+
    `${cell(row.scores.tracks)} | ${row.fallback || 'placeholder'} |`),
  '',
  'Reference GLBs remain quarantined measurement and visual-review oracles only. '+
    'Every playable must be repository-authored procedural geometry; copied meshes, converted vertices, '+
    'opaque payloads and source-backed wrappers are forbidden.','',
  'Component cells are N/A when a source GLB is fused and therefore cannot expose an independent hull/turret mask. '+
    'Its whole silhouette and lower running-gear profile remain scored.','',
].join('\n');
fs.writeFileSync(path.join(REPORT_DIR,'procedural-fidelity.md'),md);

console.log(`\nprocedural-fidelity: ${summary.passed}/${summary.references} available references pass `+
  `${PASS}+ overall / ${VIEW_FLOOR}+ each view; ${summary.unavailable} unavailable; `+
  `median ${summary.median.toFixed(1)}; worst ${summary.worst}; best ${summary.best}`);
if (CHECK && (summary.failed || summary.unavailable)) process.exitCode=1;
