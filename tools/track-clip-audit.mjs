// Track-containment audit driver (owner law 2026-08-03, GEOMETRY-GATE.md #4): fleet audit
// driver for tools/track-clip-audit.html. Lists procedural-source ids, audits
// each for track-band interpenetration with hull solids at the bow/stern
// wrap zones, prints offenders worst-first, writes shots/track-clip.json.
// Own vite 74xx-77xx; cot-shots FIFO lock shared with the capture harnesses.
//
// SHOE-ENVELOPE columns (§B4 amendment; m1a1ha owner report 2026-08-05: shoes
// glitched through the rear plates while the band test read 0/0): every zone
// now also carries shoeVox/shoeHits — the instanced shoe/pad system sampled
// per world-transformed instance (the player-visible surface, riding
// +0.085 m outside the band face; see the page header). Band columns and the
// console `front N rear N` tokens are UNCHANGED (tank-standard-check and the
// live lanes parse them); shoe columns append after. Alongside the legacy
// shots/track-clip.json (extended in place with the new fields), the driver
// writes shots/track-clip-shoes.json: the per-zone band-vs-shoe comparison
// with blind spots (shoeVox > 0 while bandVox = 0 — the m1a1ha class)
// ranked worst-first.
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
      const sf = r.zones?.[0]?.shoeVox ?? '?';
      const sb = r.zones?.[1]?.shoeVox ?? '?';
      const worst = r.zones?.flatMap((z) => z.hits.map((h) => `${z.name}:${h.mesh}(${h.vox})`)).slice(0, 3).join(' ') || '';
      const shoeWorst = r.zones?.flatMap((z) => (z.shoeHits || []).map((h) => `${z.name}:${h.mesh}(${h.vox})`)).slice(0, 3).join(' ') || '';
      // NOTE: `front N rear N` stays the FIRST match on the line — the shoe
      // columns append after it (tank-standard-check regex compatibility).
      console.log(`[track-clip] ${id.padEnd(18)} front ${String(f).padStart(5)} rear ${String(b).padStart(5)} | shoe front ${String(sf).padStart(5)} rear ${String(sb).padStart(5)} ${r.mode && r.mode !== 'bands' ? r.mode + ' ' : ''}${r.shoe && r.shoe.mode !== 'instanced' ? r.shoe.mode + ' ' : ''}${r.anomaly || ''} ${worst}${shoeWorst ? ' | shoeHits ' + shoeWorst : ''}`);
    } catch (e) {
      results.push({ id, error: e.message.slice(0, 120) });
      console.log(`[track-clip] ${id.padEnd(18)} ERROR ${e.message.slice(0, 80)}`);
    }
  }
  mkdirSync('shots', { recursive: true });
  writeFileSync('shots/track-clip.json', JSON.stringify(results, null, 1));
  const offenders = results.filter((r) => r.zones && r.zones.some((z) => z.overlapVox > 0));
  console.log(`[track-clip] offenders: ${offenders.length}/${results.length} -> shots/track-clip.json`);
  // ---- shoe-envelope comparison report (band vs shoe per zone) --------------
  const rows = [];
  for (const r of results) {
    if (!r.zones) continue;
    for (const z of r.zones) {
      if (z.shoeVox === undefined) continue;
      rows.push({
        id: r.id, zone: z.name, bandVox: z.overlapVox, shoeVox: z.shoeVox,
        blindSpot: z.shoeVox > 0 && z.overlapVox === 0,
        shoeMode: r.shoe?.mode ?? null,
        shoeHits: (z.shoeHits || []).slice(0, 3),
      });
    }
  }
  const blind = rows.filter((r) => r.blindSpot).sort((x, y) => y.shoeVox - x.shoeVox);
  writeFileSync('shots/track-clip-shoes.json', JSON.stringify({
    generated: new Date().toISOString(),
    exact: process.argv.includes('--exact'),
    note: 'shoeVox = instanced shoe/pad envelope vs hull solids (player-visible surface); bandVox = legacy band test. blindSpot = shoeVox>0 while bandVox=0 (the m1a1ha class).',
    rows, blindSpots: blind,
  }, null, 1));
  const shoeOffenders = results.filter((r) => r.zones && r.zones.some((z) => (z.shoeVox ?? 0) > 0));
  console.log(`[track-clip] shoe offenders: ${shoeOffenders.length}/${results.length}, blind spots (shoe>0, band=0): ${blind.length} -> shots/track-clip-shoes.json`);
  for (const bz of blind) {
    console.log(`[track-clip]   BLIND-SPOT ${bz.id.padEnd(18)} ${bz.zone.padEnd(5)} band ${String(bz.bandVox).padStart(5)} shoe ${String(bz.shoeVox).padStart(5)} ${bz.shoeHits.map((h) => `${h.mesh}(${h.vox})`).join(' ')}`);
  }
} finally {
  await browser.close();
  await server.close();
  releaseLock();
}
