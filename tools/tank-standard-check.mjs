// TANK STANDARD CHECK v2 (docs/BUILD-STANDARD.md §F.3) — one command that
// aggregates the standard's machine-checkable gates per tank:
//   A.  geometry-gate components (latest docs/geometry-gate/<id>.json,
//       staleness-flagged; use --gate to force a fresh run first)
//   B4. track containment (tools/track-clip-audit.mjs --exact)
//   B2. CONTIGUITY (v2): top-down ~6 cm scan on the procedural build via
//       tools/standard-check-page.html — enclosed sky cells inside the plan
//       silhouette are holes; 0 required. FrontSide render truth doubles as
//       the winding audit.
//   B3. DECORATION census (v2): KIT.fittings marker roots on the procedural
//       build — pintleMG/openYokeRws instances (mg >= 1 required) + other fitting
//       dressing. Hand-authored decoration carries no markers and censuses
//       ZERO: migrate the profile to KIT.fittings (kit.js) or carry a packet
//       justification.
// Usage:
//   node tools/tank-standard-check.mjs --ids=a,b [--gate] [--no-render]
//   node tools/tank-standard-check.mjs --fixture     # KIT.fittings self-test
// Own vite 74xx-77xx; cot-shots FIFO lock held around the render phase only
// (geometry-gate / track-clip-audit manage their own turns).
import { execFileSync } from 'node:child_process';
import {
  readFileSync, statSync, mkdirSync, rmdirSync, writeFileSync, readdirSync, unlinkSync, utimesSync,
} from 'node:fs';
import { join } from 'node:path';

const idArg = process.argv.find((a) => a.startsWith('--ids='));
const wantFixture = process.argv.includes('--fixture');
if (!idArg && !wantFixture) {
  console.error('usage: node tools/tank-standard-check.mjs --ids=a,b [--gate] [--no-render] | --fixture');
  process.exit(1);
}
const ids = idArg ? idArg.slice(6).split(',') : [];
const forceGate = process.argv.includes('--gate');
const noRender = process.argv.includes('--no-render');

// --- exclusive render lock (same protocol as tools/screenshot.mjs) ----------
const LOCK_DIR = '/tmp/cot-shots.lock';
const QUEUE_DIR = '/tmp/cot-shots.queue';
const LOCK_STALE_MS = 5 * 60 * 1000;
const TICKET_STALE_MS = 60 * 60 * 1000;
let lockHeld = false;
function ticketPid(name) { const m = name.match(/-(\d+)\.t$/); return m ? parseInt(m[1], 10) : -1; }
function ticketAlive(name) {
  const pid = ticketPid(name);
  if (pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (err) { return err.code === 'EPERM'; }
}
async function acquireLock(timeoutMs) {
  mkdirSync(QUEUE_DIR, { recursive: true });
  const myTicket = `${String(Date.now()).padStart(15, '0')}-${process.pid}.t`;
  writeFileSync(join(QUEUE_DIR, myTicket), String(process.pid));
  const t0 = Date.now();
  try {
    for (;;) {
      let head = null;
      let names = [];
      try { names = readdirSync(QUEUE_DIR).filter((n) => n.endsWith('.t')).sort(); } catch (_) { names = [myTicket]; }
      for (const n of names) {
        if (n === myTicket) { head = head || n; break; }
        let stale = false;
        try { stale = Date.now() - statSync(join(QUEUE_DIR, n)).mtimeMs > TICKET_STALE_MS; } catch (_) { continue; }
        if (stale || !ticketAlive(n)) { try { unlinkSync(join(QUEUE_DIR, n)); } catch (_) { /* raced */ } continue; }
        head = n; break;
      }
      if (head === myTicket) {
        try { mkdirSync(LOCK_DIR); lockHeld = true; return; } catch (_) { /* held */ }
        try {
          if (Date.now() - statSync(LOCK_DIR).mtimeMs > LOCK_STALE_MS) { try { rmdirSync(LOCK_DIR); } catch (e) { if (e.code === 'ENOTDIR') unlinkSync(LOCK_DIR); else throw e; } continue; }
        } catch (_) { continue; }
      }
      if (Date.now() - t0 > timeoutMs) throw new Error('cot-shots lock timeout');
      await new Promise((r) => setTimeout(r, head === myTicket ? 300 : 1000));
    }
  } finally {
    try { unlinkSync(join(QUEUE_DIR, myTicket)); } catch (_) { /* fine */ }
  }
}
function releaseLock() { if (!lockHeld) return; lockHeld = false; try { rmdirSync(LOCK_DIR); } catch (_) { /* fine */ } }
process.on('exit', releaseLock);

// --- phase 0: optional fresh gate run (manages its own lock) ----------------
// A forced run may legitimately skip a registered comparison oracle when its
// ignored/local source model is absent from this worktree. Keep the historical
// packet for authoring reference, but do not mistake it for a measurement made
// by this release run.
let freshGateStartedAt = null;
if (forceGate && ids.length) {
  // The geometry gate filters this fleet to IDs with registered local
  // comparison oracles. --check ensures an eligible oracle failure remains a
  // hard release failure rather than being mistaken for a procedural-only ID.
  freshGateStartedAt = Date.now();
  execFileSync('node', ['tools/geometry-gate.mjs', `--ids=${ids.join(',')}`, '--check'], { stdio: 'inherit' });
}

// --- phase 1: containment (one batched run; manages its own lock) -----------
const clip = new Map();
if (ids.length) {
  try {
    const out = execFileSync('node', ['tools/track-clip-audit.mjs', '--exact', '--strict', `--ids=${ids.join(',')}`],
      { encoding: 'utf8' });
    for (const line of out.split('\n')) {
      const m = line.match(/\[track-clip\] (\S+)\s+front\s+(\S+) rear\s+(\S+)/);
      const s = line.match(/\| strict sweep (\S+)\/(\S+)/);
      if (m) clip.set(m[1], { front: m[2], rear: m[3], sweepBand: s?.[1] ?? '—', sweepShoe: s?.[2] ?? '—' });
    }
  } catch (e) {
    console.error('[standard-check] track-clip audit failed:', e.message.slice(0, 120));
  }
}

// --- phase 2: census + contiguity via the committed page --------------------
const standard = new Map(); // id -> { census, holes } | { error }
let fixture = null;
if ((ids.length && !noRender) || wantFixture) {
  const { createServer } = await import('vite');
  const puppeteer = (await import('puppeteer')).default;
  await acquireLock(20 * 60 * 1000);
  const lockRefresher = setInterval(() => {
    try { const now = new Date(); utimesSync(LOCK_DIR, now, now); } catch (_) { /* fine */ }
  }, 60 * 1000);
  lockRefresher.unref();
  const server = await createServer({
    root: process.cwd(), logLevel: 'error',
    server: { port: 7400 + Math.floor(Math.random() * 400), strictPort: false, hmr: false, watch: null },
  });
  await server.listen();
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(120000);
    let pageError = null;
    page.on('pageerror', (e) => { pageError = String(e && e.message || e).slice(0, 160); });
    const base = `http://localhost:${server.config.server.port}/tools/standard-check-page.html`;
    if (!noRender) {
      for (const id of ids) {
        pageError = null;
        try {
          await page.goto(`${base}?id=${id}`, { waitUntil: 'domcontentloaded' });
          await page.waitForFunction('window.__STANDARD_READY === true', { polling: 50 });
          const r = await page.evaluate('window.__STANDARD');
          standard.set(id, r.error ? { error: r.error } : r);
        } catch (e) {
          standard.set(id, { error: (pageError || e.message).slice(0, 160) });
        }
      }
    }
    if (wantFixture) {
      await page.goto(`${base}?fixture=fittings`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction('window.__FIXTURE_READY === true', { polling: 50 });
      fixture = await page.evaluate('window.__FIXTURE');
    }
  } finally {
    await browser.close();
    await server.close();
    clearInterval(lockRefresher);
    releaseLock();
  }
}

// --- fixture report ----------------------------------------------------------
let fixtureFailed = false;
if (fixture) {
  console.log('[standard-check] KIT.fittings self-test');
  for (const r of fixture.results) {
    console.log(`  ${r.label.padEnd(18)} meshes ${String(r.meshes).padStart(2)}  hash ${r.hash.padEnd(8)}` +
      `  top-cover ${String(r.coveredCells).padStart(4)} cells  enclosed ${r.holeCells}`);
  }
  if (fixture.failures.length) {
    fixtureFailed = true;
    for (const f of fixture.failures) console.log(`  FAIL: ${f}`);
  }
  console.log(`[standard-check] fixture ${fixture.ok ? 'PASS' : 'FAIL'} ` +
    `(${fixture.results.length} builds, ${fixture.failures.length} failures)`);
  if (!ids.length) process.exit(fixtureFailed ? 2 : 0);
  console.log('');
}

// --- per-tank table ----------------------------------------------------------
const CLIP_BAND = 0; // strict owner law: no non-running-gear solid may enter the animated sweep
console.log('id                 | gateMin | components (h/w/t/st/d/f)      | age  | clip f/r+sweep | contig | decor');
console.log('-------------------|---------|--------------------------------|------|----------------|--------|------------');
let fails = 0;
for (const id of ids) {
  let row = 'procedural-only', min = 'N/A', age = '—';
  let gateApplicable = false;
  try {
    const p = `docs/geometry-gate/${id}.json`;
    const j = JSON.parse(readFileSync(p, 'utf8'));
    const packetMtime = statSync(p).mtimeMs;
    gateApplicable = freshGateStartedAt === null || packetMtime >= freshGateStartedAt;
    const c = j.components;
    if (gateApplicable) {
      min = j.geoMin;
      row = [c.hullCurves, c.wholeCurves, c.turretCurves, c.stations, c.dims, c.floaters].join('/');
      age = `${Math.round((Date.now() - packetMtime) / 60000)}m`;
    }
  } catch { /* keep placeholder */ }
  const cl = clip.get(id);
  const clipStr = cl ? `${cl.front}/${cl.rear}+${cl.sweepBand}/${cl.sweepShoe}` : '—';
  const clipOk = cl && Number(cl.front) <= CLIP_BAND && Number(cl.rear) <= CLIP_BAND
    && Number(cl.sweepBand) <= CLIP_BAND && Number(cl.sweepShoe) <= CLIP_BAND;
  const gateOk = !gateApplicable || (typeof min === 'number' && min >= 90);

  const st = standard.get(id);
  let contigStr = 'SKIP', decorStr = 'SKIP', contigOk = true, decorOk = true;
  if (!noRender) {
    if (!st || st.error) {
      contigStr = 'ERR'; decorStr = 'ERR'; contigOk = false; decorOk = false;
      if (st && st.error) console.error(`[standard-check] ${id}: ${st.error}`);
    } else if (st.holes.error) {
      contigStr = 'ERR'; contigOk = false;
      console.error(`[standard-check] ${id} hole scan: ${st.holes.error}`);
      decorOk = st.census.mg >= 1;
      decorStr = `mg${st.census.mg}+${st.census.dressing}d${decorOk ? ' ✓' : ' ✗'}`;
    } else {
      const holes = st.holes.holeCells;
      contigOk = holes === 0;
      contigStr = `${holes}${contigOk ? ' ✓' : ' ✗'}`;
      decorOk = st.census.mg >= 1;
      decorStr = `mg${st.census.mg}+${st.census.dressing}d${decorOk ? ' ✓' : ' ✗'}`;
      if (!contigOk && st.holes.clusters?.length) {
        console.error(`[standard-check] ${id} holes at ` +
          st.holes.clusters.map((c) => `(x ${c.x}, z ${c.z}) ${c.cells}c`).join(', '));
      }
    }
  }
  if (!gateOk || (cl && !clipOk) || !contigOk || !decorOk) fails++;
  console.log(
    `${id.padEnd(19)}| ${String(min).padStart(7)} | ${String(row).padEnd(31)}| ${String(age).padStart(4)} | ` +
    `${clipStr.padStart(14)}${cl ? (clipOk ? ' ✓' : ' ✗') : '  '}| ${contigStr.padStart(6)} | ${decorStr}`);
}
if (ids.length) {
  console.log(`\n[standard-check] ${ids.length - fails}/${ids.length} pass the machine-checkable gates ` +
    `(gate>=90 where a local oracle exists + clip<=${CLIP_BAND}${noRender ? '' : ' + holes=0 + mg>=1'}).`);
  if (!noRender) {
    console.log('[standard-check] decor censuses KIT.fittings markers only (§B3): hand-authored ' +
      'decoration predating the fittings library reads mg0+0d — migrate the profile to ' +
      'KIT.fittings.<fn> or carry a packet justification.');
  }
}
process.exit(fails || fixtureFailed ? 2 : 0);
