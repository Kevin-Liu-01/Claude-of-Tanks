// CONTIG PHASE AUDIT — the §B2 hidden-gap census for the vehicle lanes (item/guards-contig-grid-227).
// For each id it builds the procedural tank once in tools/standard-check-page.html and records, from the same build:
//   - the pre-227 AABB-framed scan (what tank-standard-check reported on main through 226: `legacy`), and
//   - the hull-anchored lattice at every sub-cell phase (what the gate reads from 227: `anchored`),
// then lists every distinct anchored gap with its plan location, extent, through-width, the phases that see it, the
// meshes walling it, and whether the old raster saw it at all. A gap the old raster missed is HIDDEN on main: it
// fails tank-standard-check as soon as that tank is next gated. Not a gate step; a one-off census with --ids.
//   node tools/contig-phase-audit.mjs --ids=a,b [--out=<dir>] [--report=<md>] [--quality=low]   (--all = every fleet id)
//   node tools/contig-phase-audit.mjs --prove=<id> [--out=<dir>]   (seeds the 226 class: a 1 cm add-on swept
//        0..7 cm past the bow and the side; the legacy raster flips, the anchored scan must not move)
//   node tools/contig-phase-audit.mjs --report=<md> --from=<audit.jsonl>   (re-render the list, no browser)
// Capture lock (NORMAL band) held per batch, released and re-queued every 15 minutes; resumes from audit.jsonl.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { acquireCaptureLock, refreshCaptureLock, releaseCaptureLock } from './capture-lock.mjs';
import { withIsolatedCaptureBrowser } from './isolated-capture-browser.mjs';
import { CONTIG_CELL_M } from './contig-grid.mjs';

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const outDir = path.resolve(arg('out') ?? '.qa-dev/reports/contig-audit');
const prove = arg('prove');
const from = arg('from');
const report = arg('report');
const quality = arg('quality') ?? 'high';
if (!['high', 'low'].includes(quality)) throw new Error('Expected --quality=high|low');
const HOLD_MS = 15 * 60 * 1000;

async function fleetIds() {
  const { FLEET_GROUP_BY_ID } = await import('../src/vehicles/fleetManifest.ts');
  return Object.keys(FLEET_GROUP_BY_ID).sort();
}

function summarize(scan) {
  if (!scan || scan.error) return { error: scan?.error ?? 'missing scan' };
  return {
    framing: scan.framing, holeCells: scan.holeCells, gridW: scan.gridW, gridH: scan.gridH, bounds: scan.bounds,
    ...(scan.phases ? { phases: scan.phases.map((p) => p.holeCells), phaseOnlyCells: scan.phaseOnlyCells } : {}),
    samples: scan.samples.map((s) => [+s.x.toFixed(3), +s.z.toFixed(3)]),
  };
}

/** A legacy sample inside the gap's plan extent (half a cell of slack) means the old raster saw this gap. */
function seenByLegacy(gap, legacy) {
  if (!legacy?.samples) return null;
  const sx = gap.w / 2 + CONTIG_CELL_M / 2, sz = gap.d / 2 + CONTIG_CELL_M / 2;
  return legacy.samples.some(([x, z]) => Math.abs(x - gap.x) <= sx && Math.abs(z - gap.z) <= sz);
}

function auditRow(id, standard) {
  if (!standard || standard.error) return { id, error: standard?.error ?? 'no result' };
  const anchored = summarize(standard.holes), legacy = summarize(standard.legacyHoles);
  const gaps = (standard.gapWalls ?? standard.holes.gaps ?? []).map((g) => ({ ...g, seenOnMain: seenByLegacy(g, legacy) }));
  return { id, anchored, legacy, gaps, interiorFillRecordLoaded: standard.interiorFillRecordLoaded };
}

async function withPage(run) {
  return withIsolatedCaptureBrowser({
    root: process.cwd(), logLevel: 'error',
    server: { port: 7400 + Math.floor(Math.random() * 400), strictPort: false, hmr: false, watch: null },
  }, {
    headless: 'new',
    args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
  }, async ({ server, browser }) => {
    const page = await browser.newPage();
    page.setDefaultTimeout(120000);
    let pageError = null;
    page.on('pageerror', (e) => { pageError = String(e?.message || e).slice(0, 200); });
    const base = `http://localhost:${server.config.server.port}/tools/standard-check-page.html`;
    const scan = async (query) => {
      pageError = null;
      try {
        await page.goto(`${base}?${query}`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction('window.__STANDARD_READY === true', { polling: 50 });
        return await page.evaluate('window.__STANDARD');
      } catch (e) {
        return { error: (pageError || e.message).slice(0, 200) };
      }
    };
    return run(scan);
  });
}

async function locked(run) {
  await acquireCaptureLock(60 * 60 * 1000);
  const refresher = setInterval(() => { refreshCaptureLock(); }, 60 * 1000);
  refresher.unref();
  try { return await run(); } finally { clearInterval(refresher); releaseCaptureLock(); }
}
process.on('exit', releaseCaptureLock);

const fmt = (v) => (v >= 0 ? '+' : '') + v.toFixed(2);
const cm = (m) => `${Math.round(m * 100)}`;

function markdown(rows, meta) {
  const ok = rows.filter((r) => !r.error);
  const withGaps = ok.filter((r) => r.gaps.length);
  const hiddenIds = ok.filter((r) => r.gaps.some((g) => g.seenOnMain === false));
  const mainClean = ok.filter((r) => r.legacy.holeCells === 0 && r.gaps.length);
  const legacyOnly = ok.filter((r) => r.legacy.holeCells > 0 && !r.gaps.length);
  const hiddenGaps = ok.flatMap((r) => r.gaps.filter((g) => g.seenOnMain === false).map((g) => ({ id: r.id, ...g })));
  const L = [];
  L.push('# §B2 hidden contiguity gaps on main (hull-anchored lattice audit)', '');
  L.push(`Generated ${meta.at} by \`tools/contig-phase-audit.mjs\` on ${meta.head} (worktree branch ${meta.branch}). ` +
    'One procedural build per id (camoSeed 4242, high quality, proceduralOnly), scanned twice from the same build: ' +
    'the pre-227 AABB-framed raster (what `tank-standard-check` reported on main through 226) and the 227 hull-anchored ' +
    '6 cm lattice at all nine sub-cell phases (what the gate reads once item/guards-contig-grid-227 lands).', '');
  L.push('**How to read it.** A *gap* is one connected patch of enclosed sky in plan view (cells fully uncovered at some ' +
    'phase, merged across phases). x is the vehicle\'s lateral axis (+x = left side when looking forward), z is ' +
    'forward (+z = bow), metres in the tank root frame. `w x d` is the gap\'s plan extent along x and z; `through` ' +
    'is the median narrow width of the sky slot (the dimension a closure has to bridge). `phases` = how many of the ' +
    'nine lattice phases see it (9/9 = a gap any grid finds; 1-3/9 = a 6-8 cm slot the old raster found only by ' +
    'luck of alignment). `walls` = the meshes hit by vertical rays 4 cm outside each side (mesh name @ top height). ' +
    '*Hidden* = the old raster saw no hole there: these are the gaps that appeared or vanished with unrelated ' +
    'add-ons in 226 and that will fail the gate the next time the tank is gated.', '');
  L.push('## Summary', '');
  L.push(`- ids scanned: ${ok.length}${rows.length - ok.length ? ` (${rows.length - ok.length} errors: ${rows.filter((r) => r.error).map((r) => r.id).join(', ')})` : ''}`);
  L.push(`- ids with any enclosed gap on the anchored lattice: **${withGaps.length}** (${withGaps.reduce((n, r) => n + r.gaps.length, 0)} gaps)`);
  L.push(`- ids with at least one HIDDEN gap (missed by main's raster): **${hiddenIds.length}** (${hiddenGaps.length} gaps)`);
  L.push(`- ids main reported clean that have gaps: **${mainClean.length}**${mainClean.length ? ` — ${mainClean.map((r) => r.id).join(', ')}` : ''}`);
  L.push(`- ids main reported holes for that the anchored lattice finds clean at every phase: ${legacyOnly.length}${legacyOnly.length ? ` — ${legacyOnly.map((r) => `${r.id} (${r.legacy.holeCells})`).join(', ')}` : ''}`);
  L.push(`- registered approved-opening ids (Ariete, Barak, AFT-10, Warrior TES(H)) are listed with their raw counts; ` +
    'their primary holes are classified by tools/source-openings-policy.mjs, not here.', '');
  L.push('## Hidden gaps (missed by main\'s raster) — the vehicle lanes\' list', '');
  if (!hiddenGaps.length) L.push('None.', '');
  else {
    L.push('| id | at (x, z) m | w x d cm | through cm | phases | walls (-x / +x / -z / +z) |', '|---|---|---|---|---|---|');
    for (const g of hiddenGaps) L.push(`| ${g.id} | (${fmt(g.x)}, ${fmt(g.z)}) | ${cm(g.w)} x ${cm(g.d)} | ${cm(g.gap)} | ${g.phases}/9 | ${(g.walls ?? []).map((w) => w.mesh ? `${w.mesh}@${w.y.toFixed(2)}` : 'sky').join(' / ')} |`);
    L.push('');
  }
  L.push('## Every id with an anchored gap', '');
  L.push('| id | main raw cells | anchored primary cells | phase-only cells | per-phase cells | gaps (hidden) |', '|---|---|---|---|---|---|');
  for (const r of withGaps) {
    L.push(`| ${r.id} | ${r.legacy.holeCells} | ${r.anchored.holeCells} | ${r.anchored.phaseOnlyCells} | ${r.anchored.phases.join(' ')} | ${r.gaps.length} (${r.gaps.filter((g) => g.seenOnMain === false).length}) |`);
  }
  L.push('');
  L.push('## All gaps seen on both rasters (inherited reds, unchanged by the lattice)', '');
  const seen = ok.flatMap((r) => r.gaps.filter((g) => g.seenOnMain).map((g) => ({ id: r.id, ...g })));
  if (!seen.length) L.push('None.', '');
  else {
    L.push('| id | at (x, z) m | w x d cm | through cm | phases | walls (-x / +x / -z / +z) |', '|---|---|---|---|---|---|');
    for (const g of seen) L.push(`| ${g.id} | (${fmt(g.x)}, ${fmt(g.z)}) | ${cm(g.w)} x ${cm(g.d)} | ${cm(g.gap)} | ${g.phases}/9 | ${(g.walls ?? []).map((w) => w.mesh ? `${w.mesh}@${w.y.toFixed(2)}` : 'sky').join(' / ')} |`);
    L.push('');
  }
  L.push(`Machine-readable rows: ${meta.jsonl}.`, '');
  return L.join('\n');
}

function readRows(file) {
  if (!existsSync(file)) return [];
  const byId = new Map();
  for (const line of readFileSync(file, 'utf8').split('\n')) if (line.trim()) { const r = JSON.parse(line); byId.set(r.id, r); }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function meta(jsonl) {
  const git = (...a) => { try { return execFileSync('git', a, { encoding: 'utf8' }).trim(); } catch { return '?'; } };
  return { at: new Date().toISOString(), head: git('rev-parse', '--short', 'HEAD'), branch: git('rev-parse', '--abbrev-ref', 'HEAD'), jsonl };
}

mkdirSync(outDir, { recursive: true });
if (from) {
  if (!report) throw new Error('--from needs --report=<md>');
  writeFileSync(report, markdown(readRows(from), meta(from)));
  console.log(`[contig-audit] wrote ${report} from ${from}`);
  process.exit(0);
}

if (prove) {
  if (!/^[a-z0-9_]+$/.test(prove)) throw new Error('Expected a tank id');
  const rows = [];
  await locked(() => withPage(async (scan) => {
    for (const axis of ['Z', 'X']) {
      for (let mm = 0; mm <= 70; mm += 5) {
        const r = await scan(`id=${prove}&legacy=1${mm ? `&addon${axis}=${(mm / 1000).toFixed(3)}` : ''}`);
        if (r.error) throw new Error(`${prove} addon${axis} ${mm} mm: ${r.error}`);
        rows.push({ axis, mm, legacy: r.legacyHoles.holeCells, legacyBounds: r.legacyHoles.bounds,
          anchored: { primary: r.holes.holeCells, phaseOnly: r.holes.phaseOnlyCells, phases: r.holes.phases.map((p) => p.holeCells),
            gaps: r.holes.gaps.map((g) => [g.x, g.z, g.w, g.d, g.cells]) }, bounds: r.holes.bounds });
        console.log(`[contig-prove] ${prove} addon${axis} ${String(mm).padStart(2)} mm  legacy raw ${String(rows.at(-1).legacy).padStart(3)}  ` +
          `anchored primary ${rows.at(-1).anchored.primary} phase-only ${rows.at(-1).anchored.phaseOnly} gaps ${rows.at(-1).anchored.gaps.length}`);
      }
    }
  }));
  const sig = (r) => JSON.stringify(r.anchored);
  const stable = rows.every((r) => sig(r) === sig(rows[0]));
  const legacyValues = [...new Set(rows.map((r) => r.legacy))];
  const file = path.join(outDir, `prove-${prove}.json`);
  writeFileSync(file, JSON.stringify({ id: prove, anchoredStable: stable, legacyValues, rows }, null, 1) + '\n');
  console.log(`[contig-prove] ${prove}: anchored ${stable ? 'IDENTICAL' : 'CHANGED'} across ${rows.length} add-on reaches; ` +
    `legacy raw cells took ${legacyValues.length} values (${legacyValues.join(', ')}) -> ${file}`);
  process.exit(stable ? 0 : 1);
}

const idArg = arg('ids');
if (!idArg && !process.argv.includes('--all')) {
  console.error('usage: node tools/contig-phase-audit.mjs --ids=a,b | --all [--out=<dir>] [--report=<md>] | --prove=<id> | --report=<md> --from=<jsonl>');
  process.exit(1);
}
const ids = idArg ? idArg.split(',') : await fleetIds();
if (ids.some((id) => !/^[a-z0-9_]+$/.test(id))) throw new Error('Expected tank ids');
const jsonl = path.join(outDir, 'audit.jsonl');
const done = new Set(readRows(jsonl).filter((r) => !r.error).map((r) => r.id));
let queue = ids.filter((id) => !done.has(id));
console.log(`[contig-audit] ${ids.length} ids, ${ids.length - queue.length} already in ${jsonl}, ${queue.length} to scan`);
while (queue.length) {
  await locked(() => withPage(async (scan) => {
    const started = Date.now();
    while (queue.length && Date.now() - started < HOLD_MS) {
      const id = queue.shift();
      const row = { ...auditRow(id, await scan(`id=${id}&quality=${quality}&legacy=1&neighbors=1`)), quality };
      appendFileSync(jsonl, JSON.stringify(row) + '\n');
      console.log(row.error ? `[contig-audit] ${id} ERROR ${row.error}`
        : `[contig-audit] ${id.padEnd(22)} main raw ${String(row.legacy.holeCells).padStart(3)} | anchored ${String(row.anchored.holeCells).padStart(3)} +${row.anchored.phaseOnlyCells}φ | gaps ${row.gaps.length} hidden ${row.gaps.filter((g) => g.seenOnMain === false).length}`);
    }
  }));
}
if (report) {
  writeFileSync(report, markdown(readRows(jsonl), meta(jsonl)));
  console.log(`[contig-audit] wrote ${report}`);
}
