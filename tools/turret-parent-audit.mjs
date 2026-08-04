// Turret-furniture parenting audit driver (owner law 2026-08-04,
// BUILD-STANDARD §B5): fleet driver for tools/turret-parent-audit.html.
// STRANDED = hull-parented mesh overlapping the turret casting envelope
// (reads as turret furniture but will not yaw with the turret);
// DANGLING = turret-parented mesh entirely below the ring plane (the m1a1
// tow-cable class: sweeps mid-air on yaw). Prints offenders worst-first,
// writes shots/turret-parent.json.
// Own vite 74xx-77xx; cot-shots FIFO lock shared with the capture harnesses.
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { mkdirSync, rmdirSync, statSync, writeFileSync, readdirSync, unlinkSync, utimesSync } from 'node:fs';
import { join } from 'node:path';

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
await acquireLock(45 * 60 * 1000);
process.on('exit', releaseLock);
const refresher = setInterval(() => { try { const now = new Date(); utimesSync(LOCK_DIR, now, now); } catch (_) { /* fine */ } }, 60 * 1000);
refresher.unref();

const idArg = process.argv.find((a) => a.startsWith('--ids='));
const server = await createServer({
  root: process.cwd(), logLevel: 'error',
  server: { port: 7461 + Math.floor(Math.random() * 30), strictPort: false, hmr: false, watch: { ignored: ['**/*'] } },
});
await server.listen();
const port = server.config.server.port;
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
page.setDefaultTimeout(180000);
const results = [];
try {
  let ids;
  if (idArg) {
    ids = idArg.slice(6).split(',');
  } else {
    await page.goto(`http://localhost:${port}/tools/turret-parent-audit.html?mode=list`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction('window.__TP_READY === true', { polling: 50 });
    ids = (await page.evaluate('window.__TP_RESULT')).ids;
  }
  console.log(`[turret-parent] auditing ${ids.length} procedural ids`);
  for (const id of ids) {
    try {
      await page.goto(`http://localhost:${port}/tools/turret-parent-audit.html?id=${id}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction('window.__TP_READY === true', { polling: 50 });
      const r = await page.evaluate('window.__TP_RESULT');
      results.push(r);
      const s = r.stranded?.length ?? '?';
      const a = r.abutting?.length ?? '?';
      const d = r.dangling?.length ?? '?';
      const worst = (r.stranded || []).slice(0, 3)
        .map((h) => `${h.mesh}(${Math.round(h.overlap * 100)}%)`).join(' ');
      console.log(`[turret-parent] ${id.padEnd(18)} stranded ${String(s).padStart(3)} abutting ${String(a).padStart(3)} dangling ${String(d).padStart(3)}  ${r.anomaly || ''}${worst}`);
    } catch (e) {
      results.push({ id, error: e.message.slice(0, 120) });
      console.log(`[turret-parent] ${id.padEnd(18)} ERROR ${e.message.slice(0, 80)}`);
    }
  }
  mkdirSync('shots', { recursive: true });
  writeFileSync('shots/turret-parent.json', JSON.stringify(results, null, 1));
  const offenders = results.filter((r) => (r.stranded && r.stranded.length) || (r.abutting && r.abutting.length) || (r.dangling && r.dangling.length));
  console.log(`[turret-parent] offenders: ${offenders.length}/${results.length} -> shots/turret-parent.json`);
} finally {
  await browser.close();
  await server.close();
  releaseLock();
}
