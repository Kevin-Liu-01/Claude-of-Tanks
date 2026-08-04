// Track-containment audit driver (owner law 2026-08-03, GEOMETRY-GATE.md #4): fleet audit
// driver for tools/track-clip-audit.html. Lists procedural-source ids, audits
// each for track-band interpenetration with hull solids at the bow/stern
// wrap zones, prints offenders worst-first, writes shots/track-clip.json.
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
          if (Date.now() - statSync(LOCK_DIR).mtimeMs > LOCK_STALE_MS) { rmdirSync(LOCK_DIR); continue; }
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
    await page.goto(`http://localhost:${port}/tools/track-clip-audit.html?mode=list`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction('window.__CLIP_READY === true', { polling: 50 });
    ids = (await page.evaluate('window.__CLIP_RESULT')).ids;
  }
  console.log(`[track-clip] auditing ${ids.length} procedural ids`);
  for (const id of ids) {
    try {
      await page.goto(`http://localhost:${port}/tools/track-clip-audit.html?id=${id}${process.argv.includes('--exact') ? '&dilate=0' : ''}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction('window.__CLIP_READY === true', { polling: 50 });
      const r = await page.evaluate('window.__CLIP_RESULT');
      results.push(r);
      const f = r.zones?.[0]?.overlapVox ?? '?';
      const b = r.zones?.[1]?.overlapVox ?? '?';
      const worst = r.zones?.flatMap((z) => z.hits.map((h) => `${z.name}:${h.mesh}(${h.vox})`)).slice(0, 3).join(' ') || '';
      console.log(`[track-clip] ${id.padEnd(18)} front ${String(f).padStart(5)} rear ${String(b).padStart(5)} ${r.mode && r.mode !== 'bands' ? r.mode + ' ' : ''}${r.anomaly || ''} ${worst}`);
    } catch (e) {
      results.push({ id, error: e.message.slice(0, 120) });
      console.log(`[track-clip] ${id.padEnd(18)} ERROR ${e.message.slice(0, 80)}`);
    }
  }
  mkdirSync('shots', { recursive: true });
  writeFileSync('shots/track-clip.json', JSON.stringify(results, null, 1));
  const offenders = results.filter((r) => r.zones && r.zones.some((z) => z.overlapVox > 0));
  console.log(`[track-clip] offenders: ${offenders.length}/${results.length} -> shots/track-clip.json`);
} finally {
  await browser.close();
  await server.close();
  releaseLock();
}
