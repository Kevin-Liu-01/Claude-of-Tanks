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

const urlFor = (id) => `http://localhost:${server.config.server.port}/tools/procedural-fidelity.html?id=${encodeURIComponent(id)}`;
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
      await page.waitForFunction('window.__FIDELITY_READY === true', { timeout:90000, polling:60 });
      const row = await page.evaluate('window.__FIDELITY_REPORT');
      const errors = browserErrors.slice(errorStart);
      if (errors.length) row.errors = errors;
      rows.push(row);
      console.log(`[fidelity ${String(index+1).padStart(2)}/${ids.length}] ${id.padEnd(22)} ` +
        `${row.score.toFixed(1)}  H${metric(row.scores.hull)} T${metric(row.scores.turret)} ` +
        `G${metric(row.scores.gun)} R${metric(row.scores.tracks)}`);
    } catch (error) {
      const row = { id, name:id, score:0, scores:{ overall:0,hull:0,turret:0,gun:0,tracks:0 }, error:String(error) };
      rows.push(row);
      console.error(`[fidelity ${String(index+1).padStart(2)}/${ids.length}] ${id}: ${error.message}`);
    }
  }

  rows.sort((a,b) => a.score-b.score || a.id.localeCompare(b.id));
  if (shotCount) {
    const shotDir = path.join(ROOT,'shots','procedural-fidelity');
    fs.mkdirSync(shotDir,{recursive:true});
    for (const row of rows.slice(0,shotCount)) {
      await page.goto(urlFor(row.id), { waitUntil:'domcontentloaded', timeout:90000 });
      await page.waitForFunction('window.__FIDELITY_READY === true', { timeout:90000, polling:60 });
      await page.screenshot({ path:path.join(shotDir,`${row.id}.png`), fullPage:true });
    }
  }
  if (BOARD) {
    // HANDOFF-FABLE §6 evidence boards: shaded pair + articulation strip +
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

const scores = rows.map((row) => row.score).sort((a,b)=>a-b);
const median = scores.length ? scores[Math.floor(scores.length/2)] : 0;
const summary = {
  references:rows.length,
  passed:rows.filter((row)=>row.gatePassed).length,
  failed:rows.filter((row)=>!row.gatePassed).length,
  passThreshold:PASS,
  perViewFloor:VIEW_FLOOR,
  median:Number(median.toFixed(2)),
  worst:rows[0]?.id || null,
  best:rows.at(-1)?.id || null,
};
const report={ generatedAt:new Date().toISOString(),summary,rows };
fs.writeFileSync(path.join(ROOT,'docs','procedural-fidelity-report.json'),`${JSON.stringify(report,null,2)}\n`);
const cell = (value) => Number.isFinite(value) ? value.toFixed(1) : 'N/A';
const md=[
  '# Procedural tank fidelity report','',
  `Local sourced references: **${summary.references}**. Passing ${PASS}/100 overall and ${VIEW_FLOOR}/100 in every view: **${summary.passed}**. `+
    `Below target: **${summary.failed}**. Median: **${summary.median.toFixed(1)}**.`,'',
  'Red/cyan mask scoring uses identical normalized poses: 35% whole silhouette, 25% hull, '+
    '20% direct articulated turret tree, 12% cannon overhang, and 8% lower track profile.','',
  '| Tank | Score | Whole | Hull | Turret | Gun | Tracks | Procedural fallback |',
  '|---|---:|---:|---:|---:|---:|---:|---|',
  ...rows.map((row)=>`| ${row.name} (${row.id}) | ${row.score.toFixed(1)} | ${cell(row.scores.overall)} | `+
    `${cell(row.scores.hull)} | ${cell(row.scores.turret)} | ${cell(row.scores.gun)} | `+
    `${cell(row.scores.tracks)} | ${row.fallback || 'placeholder'} |`),
  '',
  'Reference GLBs remain provenance-tracked measurement and visual-review oracles. '+
    'A playable may use hand-authored procedural geometry or a documented, reproducible source-derived payload '+
    'when the owner explicitly clears that source.','',
  'Component cells are N/A when a source GLB is fused and therefore cannot expose an independent hull/turret mask. '+
    'Its whole silhouette and lower running-gear profile remain scored.','',
].join('\n');
fs.writeFileSync(path.join(ROOT,'docs','procedural-fidelity-report.md'),md);

console.log(`\nprocedural-fidelity: ${summary.passed}/${summary.references} pass ${PASS}+ overall / ${VIEW_FLOOR}+ each view; `+
  `median ${summary.median.toFixed(1)}; worst ${summary.worst}; best ${summary.best}`);
if (CHECK && summary.failed) process.exitCode=1;
