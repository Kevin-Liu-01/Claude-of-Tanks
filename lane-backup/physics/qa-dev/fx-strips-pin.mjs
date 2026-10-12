#!/usr/bin/env node
// (dfx 7e pin copy: pins the fx clock to 600 s before each load and logs it at each clip's first and last frame, read-only; otherwise fx-strips.mjs)
// fx-strips.mjs — the destruction-fx lane's motion-strip capture (scratch, never staged).
//
// Serves each --roots dist through `vite preview`, enters the Scene Studio on --map, and for every case loads a scene
// (actors + effects at tMs 0, fxTime 0, frozen), then steps the Studio's offline export clock (__STUDIO.advanceFrame)
// in fixed --step ms increments and captures each frame (__STUDIO.capture at --size). Deterministic: the same scene
// JSON + seed gives the same frames on the same build. Frames land in <out>/<label>/<case>/f000.png ...
//
//   FX_TICKET_STAMP=<ms> node .qa-dev/fx-strips.mjs --roots=<distRootA>,<distRootB> --labels=A,R6 --map=verdant \
//      --cases=muzzle-chase,he-60,... --out=<dir> [--size=1280x720] [--probe-lock=<dir>]
//
// Locks: the machine-wide capture FIFO with the session mutex in the patient-head order (patient-lock.mjs).
//
// Cases may name their own `map` (default --map): a root's page reloads once per map, in the order cases list them.
// A case with `locate: { surface, dist, camH, lookH, clear }` is authored in a LOCAL frame (the burst at [0, 0], the
// camera on -X looking toward +X): the runner finds an open, flat point of that surface on the map (the fx
// classifier's own law) with a clear line from a camera `dist` metres away, and maps the scene's points onto it
// (A and B get the same point: the search runs on the first root and is reused).
import path from 'node:path';
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { preview } from 'vite';
import puppeteer from 'puppeteer';
import { createPoliteCaptureLock } from './patient-lock.mjs';
import { locateInPage, placeScene } from './fx-locate.mjs';
// (coordinator, 2026-10-08: wave 266's strips showed ground grass popping in mid-clip) every clip starts on a settled
// world — the terrain LOD stream, the grass chunks and carpet, the tall grass, the field walls — and records the
// geometries the terrain streamed while it ran (streamedDuring); a clip that streamed is void
import { settleResidencyTerrain } from '../tools/world-residency-acquisition.mjs';
import { grassSettled } from '../tools/frame-budget-probe.mjs';
// fifo2 (capture throughput lane, 2026-10-08): the volumetric clouds take the real frame dt; frozen, every clip is a
// function of the Studio's offline clock alone (every dfx case holds its camera still, so the cloud history is held too)
import { clipMotion } from './clip-motion.mjs';
import { installCloudFreeze, pinGovernorOn, settleCloudsFrozenOn, unfreezeCloudsOn } from '/private/tmp/claude-501/-Users-kevinliu--codex-worktrees-cot-restore-1049-visuals-20260911/6412983f-6279-4f04-92ea-e3d886747505/scratchpad/fifo2/lib/cloud-freeze.mjs';

const arg = (name, fallback = null) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const roots = arg('roots').split(',').map((r) => path.resolve(r));
const labels = arg('labels').split(',');
const mapId = arg('map', 'verdant');
const out = path.resolve(arg('out'));
const [W, H] = arg('size', '1280x720').split('x').map(Number);
const probeDir = arg('probe-lock', null);
const caseFilter = arg('cases', '') ? arg('cases').split(',') : null;
const holdCapMs = Number(arg('hold-cap-ms', String(17 * 60 * 1000)));
// (fifo2 2026-10-08: parts run side by side when each binds its own ports) the base port, one per label above it: a job
// passes --port={PORT}, the runner's slot port
const basePort = Number(arg('port', '5460'));
const SCENES = (await import(path.resolve(arg('scenes')))).default;

const log = (...a) => console.log(`[fx-strips ${new Date().toISOString().slice(11, 19)}]`, ...a);

const lock = probeDir
  ? createPoliteCaptureLock({ probeDir, log, maxHolderWaitMs: 50 * 60 * 1000, patientHeadMs: 50 * 60 * 1000 })
  : null;
if (lock) {
  log('waiting for the capture FIFO + session mutex');
  await lock.acquire(Number(process.env.COT_SHOTS_LOCK_TIMEOUT_MS) || 8 * 3600 * 1000);
  process.on('exit', () => lock.release());
  setInterval(() => lock.refresh(), 30_000).unref();
}
const holdStarted = Date.now();
const overHold = () => Date.now() - holdStarted > holdCapMs;

const located = new Map();

async function runRootMap(root, label, port, map, cases) {
  const server = await preview({ root, configFile: false, logLevel: 'error', preview: { host: '127.0.0.1', port, strictPort: true } });
  const browser = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000,
    args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage', `--window-size=${W},${H}`] });
  const errors = [];
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => errors.push(String(e)));
    // a label ending in @mobile films the phone tier (the same dist)
    const tier = label.endsWith('@mobile') ? 'mobile' : 'desktop';
    const url = `http://127.0.0.1:${port}/?studio=1&map=${map}&nosplash=1&tier=${tier}&gfxreset=1`;
    log(label, 'boot', url);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 300000 });
    await page.waitForFunction('window.__GAME_READY === true', { timeout: 300000 });
    await page.waitForFunction(`window.__STUDIO && window.__STUDIO.active === true && window.__STUDIO.mapId === '${map}'`, { timeout: 300000 });
    // hide the Studio panel (captures read the canvas only, but keep the page light)
    await page.evaluate(() => { const p = document.querySelector('.cot-studio'); if (p) p.style.display = 'none'; });
    // (fifo2) the resolution governor suspended for the whole page, at full scale, before any clip: it never moves again
    await pinGovernorOn(page).catch(() => {});
    // (twin4: the first capture on a page could catch a frame not yet presented) one throwaway capture first
    await page.evaluate((w, h) => { window.__STUDIO.capture({ width: w, height: h }); }, W, H).catch(() => {});
    // (fifo2 determinism test) FX_STRIPS_NO_LENSFLARE=1: the lens flare eases its occlusion by the live frame dt
    if (process.env.FX_STRIPS_NO_LENSFLARE === '1') {
      await page.evaluate(() => window.__DEBUG?.post?.setLightFx?.({ lensFlare: false })).catch(() => {});
    }
    // one case: settle, capture, record; true when the clip is void (2026-10-08 b5: the first cases after a boot void
    // while the grass ring around a fresh camera still builds, so the voided ones are filmed again once at the end)
    let firstOnPage = true;
    const one = async (sc) => {
      const dir = path.join(out, label, sc.id);
      mkdirSync(dir, { recursive: true });
      let base = sc.scene;
      if (sc.locate) {
        // the search runs on the first root to reach the map; the others reuse its point (A and B see one place)
        const key = `${map}|${JSON.stringify(sc.locate)}`;
        let at = located.get(key);
        if (!at) {
          at = await page.evaluate(locateInPage, sc.locate);
          located.set(key, at);
          log(label, sc.id, 'located', JSON.stringify(at));
        }
        if (at.error) { log(label, sc.id, 'skipped:', at.error); return false; }
        base = placeScene(sc.scene, at);
      }
      // (b5: the Studio's timeline stops at its storyboard's length, 12 s unless a scene says more: column-60's 12-18 s and
      // the buildings' last 2 s were frozen frames) a clip that runs past 12 s carries its own length (the Studio's cap 20 s)
      const endMs = (sc.startMs || 0) + (sc.frames - 1) * sc.stepMs;
      if (endMs > 20000) log(label, sc.id, `runs to ${endMs} ms, past the Studio's 20 s timeline: frames after 20 s freeze`);
      const scene = { ...base, map, fxTime: 0, timeScale: 0,
        ...(endMs > 11500 || base.storyboard
          ? { storyboard: { ...(base.storyboard || {}), durationMs: Math.min(20000, Math.max(base.storyboard?.durationMs ?? 0, Math.ceil(endMs + 500))) } }
          : {}) };
      // (dfx 7e pin) the fx clock pinned before the load, so every page starts its clip at one absolute fx time
      await page.evaluate(() => window.__DEBUG?.fx?.setFrozen?.(false, 600)).catch(() => {});
      await page.evaluate(async (s) => { await window.__STUDIO.load(s); }, scene);
      await installCloudFreeze(page);
      // (fifo2: a pin that changes the scale resizes the render chain and wipes a frozen cloud history) the per-clip guard
      // pins before the world settles and the clouds' settle comes last
      const governor = await pinGovernorOn(page).catch((error) => ({ error: String(error?.message ?? error).slice(0, 120) }));
      // (fifo2: the census' deterministic far-tree impostor bake, not left to whenever vegetation.update lands)
      await page.evaluate(() => window.__DEBUG?.world?.warmImpostors?.()).catch(() => {});
      // settle the world at the clip's pose before its first frame
      const settle = { grass: true, tallGrass: true, walls: true, terrain: null };
      // (fifo2 twin, 2-wide hold: the first case after a boot voided on grass still building after 30 s) the first case
      // on a page waits up to 120 s for its grass ring, a later one 45 s (the grass work is wall-time sliced)
      await page.waitForFunction(() => {
        const D = window.__DEBUG, V = D.camera.position.constructor;
        D.world.update(0, D.camera.position, D.camera.getWorldDirection(new V()), null);
        const s = D.world.getGrassWorkState();
        return s.pendingVisible === 0 && !s.carpet.pending;
      }, { timeout: firstOnPage ? 120000 : 45000, polling: 'raf' }).catch(() => { settle.grass = false; });
      // (fifo2 twin check: a 2-wide hold's tall-grass ring was still building when a clip began, and passed) the tall
      // grass and the field walls get the grass's waits, and any unsettled flag voids the clip
      await page.waitForFunction(grassSettled, { timeout: firstOnPage ? 120000 : 45000, polling: 250 })
        .catch(() => { settle.tallGrass = false; });
      await page.waitForFunction(() => (window.__DEBUG.world.getFieldWallWorkState?.().pending ?? 0) === 0,
        { timeout: firstOnPage ? 120000 : 45000, polling: 250 }).catch(() => { settle.walls = false; });
      firstOnPage = false;
      settle.terrain = await page.evaluate(settleResidencyTerrain).catch((error) => ({ error: String(error?.message ?? error).slice(0, 160) }));
      // (fifo2: temporal AO retires its history only after 4 identical matrices) 8 still frames before the clip
      await page.evaluate(() => new Promise((resolve) => {
        let n = 0;
        const tick = () => { if (++n >= 8) resolve(); else requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
      }));
      const streamedCount = () => page.evaluate(() => window.__DEBUG.world?.group?.children?.find?.((c) => c.name === 'terrain')
        ?.userData?.streamingStats?.streamedGeometryCount ?? null).catch(() => null);
      const streamed0 = await streamedCount();
      // (fifo2: the adaptive-resolution governor read wall-clock frame times; a burst dropped each run to its own scale) its
      // per-clip reading is recorded: renderScale / dynScale / perfTrim must read 1 / 1 / 0
      await settleCloudsFrozenOn(page);
      // (dfx 7e, read-only) the fx clock the media's birth stamps are on, at the clip's first frame and after its last
      const fxClock = () => page.evaluate(() => {
        let t = null;
        window.__DEBUG?.scene?.traverse?.((o) => {
          const u = o.name === 'fx-volume-media' ? o.material?.uniforms?.uTime : null;
          if (u && t === null) t = u.value;
        });
        return t;
      }).catch(() => null);
      const fxClock0 = await fxClock();
      const frames = [];
      let t = 0;
      for (let i = 0; i < sc.frames; i++) {
        const step = i === 0 ? (sc.startMs || 0) : sc.stepMs;
        if (step > 0) {
          let left = step;
          while (left > 0) { const d = Math.min(1000, left); await page.evaluate((ms) => window.__STUDIO.advanceFrame(ms), d); left -= d; }
        }
        t += step;
        const cap = await page.evaluate((w, h) => window.__STUDIO.capture({ width: w, height: h }).dataURL, W, H);
        const buf = Buffer.from(cap.split(',')[1], 'base64');
        const file = path.join(dir, `f${String(i).padStart(3, '0')}.png`);
        writeFileSync(file, buf);
        frames.push({ file: path.basename(file), tMs: t });
      }
      const fxClock1 = await fxClock();
      log(label, sc.id, 'fx clock', fxClock0, '->', fxClock1);
      await unfreezeCloudsOn(page);
      const streamed1 = await streamedCount();
      const grassAfter = await page.evaluate(() => window.__DEBUG.world.getGrassWorkState()).catch(() => null);
      const streamedDuring = Number.isFinite(streamed0) && Number.isFinite(streamed1) ? streamed1 - streamed0 : null;
      const pendingAfter = grassAfter ? (grassAfter.pendingVisible ?? 0) + (grassAfter.carpet?.pending ? 1 : 0) : null;
      // (coordinator rule 2026-10-08, PROTOCOL.md) the motion receipt: a clip whose second half changes less than 1 % of
      // its crop's pixels per second while its effect should still be evolving is void (a stopped timeline never passes)
      let motion = null;
      try { motion = clipMotion(dir, frames, { evolveUntilMs: sc.evolveUntilMs ?? null }); }
      catch (error) { motion = { error: String(error?.message ?? error).slice(0, 160), still: true, checked: true }; }
      const reasons = [];
      if ((streamedDuring ?? 0) > 0) reasons.push('streamed');
      if ((pendingAfter ?? 0) > 0 || !settle.grass) reasons.push('grass unsettled');
      if (!settle.tallGrass) reasons.push('tall grass unsettled');
      if (!settle.walls) reasons.push('field walls unsettled');
      if (settle.terrain && settle.terrain.error) reasons.push('terrain settle failed');
      if (motion?.still) reasons.push(`still (${motion.ratePct ?? '?'} %/s)`);
      const voidClip = reasons.length > 0;
      writeFileSync(path.join(dir, 'frames.json'), JSON.stringify({ case: sc.id, label, root, map, frames, scene,
        settle, fxClock: [fxClock0, fxClock1], streamedDuring, grassPendingAfter: pendingAfter, motion, governor, void: voidClip, voidReasons: reasons }, null, 1));
      log(label, sc.id, `${frames.length} frames, streamedDuring ${streamedDuring}, grass pending after ${pendingAfter}, `
        + `motion ${motion?.ratePct ?? '?'} %/s over ${motion?.cropPct ?? '?'} % of the frame${voidClip ? ` — VOID (${reasons.join(', ')})` : ''}`);
      return voidClip;
    };
    const voided = [];
    for (const sc of cases) {
      if (overHold()) { log('hold cap reached; stopping before', sc.id); break; }
      if (await one(sc)) voided.push(sc);
    }
    for (const sc of voided) {
      if (overHold()) { log('hold cap reached; no retry of', sc.id); break; }
      log(label, sc.id, 'retry (its first clip was void)');
      await one(sc);
    }
  } catch (error) {
    // one map's failure (a boot timeout, a page error in the search) costs that map's cases, not the run
    log(label, map, 'failed:', String(error).slice(0, 300));
  } finally {
    if (errors.length) {
      mkdirSync(path.join(out, label), { recursive: true });
      appendFileSync(path.join(out, label, 'page-errors.txt'), `== ${map}\n${errors.join('\n')}\n`);
    }
    await browser.close().catch(() => {});
    await new Promise((r) => server.httpServer.close(r));
  }
}

// map by map, every root on a map before the next map (a hold cut short still leaves A beside B)
const allCases = SCENES.filter((sc) => !caseFilter || caseFilter.includes(sc.id));
const maps = [...new Set(allCases.map((sc) => sc.map || mapId))];
try {
  for (let i = 0; i < roots.length; i++) {
    if (!existsSync(path.join(roots[i], 'dist', 'index.html'))) throw new Error(`${roots[i]} has no dist`);
  }
  outer: for (const map of maps) {
    const cases = allCases.filter((sc) => (sc.map || mapId) === map);
    for (let i = 0; i < roots.length; i++) {
      // a case may name the labels it runs for (a candidate root on a subset)
      const mine = cases.filter((sc) => !sc.labels || sc.labels.includes(labels[i]));
      if (!mine.length) continue;
      await runRootMap(roots[i], labels[i], basePort + i, map, mine);
      if (overHold()) break outer;
    }
  }
} finally {
  if (lock) lock.release();
}
log('done in', Math.round((Date.now() - holdStarted) / 1000), 's');
process.exit(0);
