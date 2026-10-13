#!/usr/bin/env node
// world-program-warm.browser.mjs — option E's browser receipt (2026-10-13, the perf stream): a battle entry's world
// program warm (src/engine/battleWorldProgramWarm.ts) on a built dist, through the entry paths it must not disturb.
//
//   entry    a first entry of a session: the warm draws; it compiled under the light signature the revealed battle has,
//            and the battle draws its terrain with the programs it linked (no second variant).
//   failed   the minimap transfer is held and then fails once the terrain stands (the warm armed and running): the entry
//            returns to the Garage with the Garage's own light signature, the night pool detached, the warm stopped and
//            the Garage's GPU residency restored; the next entry warms and plays.
//   context  the WebGL context is lost after the terrain stands and restored 0.5 s later: the warm abandons without
//            touching the renderer, and the entry ends as the control dist's does (played or recovered to the Garage).
//   studio   the Studio (F8) is entered and left from the Garage: its world builds are never warmed; the next battle
//            entry warms and plays.
// --control: the same paths on a dist without the warm (outcomes only, the receipts' own checks skipped).
//
//   node tools/world-program-warm.browser.mjs --dist=<dist> --no-lock [--map=railyard] [--spec=t90m_x]
//        [--paths=entry,failed,context,studio] [--control] [--out=<dir>] [--tag=x]   (inside a capture-lock hold)
import path from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { withDistProbeSession, sleep } from './map-probe-runtime.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
if (!args['no-lock']) { console.error('run inside a capture-lock hold (the perf block runner passes --no-lock)'); process.exit(2); }
const dist = path.resolve(args.dist);
const mapId = args.map || 'railyard';
const spec = args.spec || 't90m_x';
const paths = (args.paths || 'entry,failed,context,studio').split(',');
const control = !!args.control;
const out = path.resolve(args.out || '.qa-dev/world-program-warm');
const tag = args.tag || (control ? 'control' : 'warm');
mkdirSync(out, { recursive: true });

// the light counts three.js keys a lit program by (the same counting as battleWorldProgramWarm.ts lightSignature);
// the Garage comparison leaves out the kill-cam's pool, which stays in the scene for good once the first entry made it
const signatureScript = (skipKillcam) => `(() => {
  const D = window.__DEBUG, n = { dir: 0, dirShadow: 0, spot: 0, spotShadow: 0, spotMap: 0, point: 0, pointShadow: 0, hemi: 0, rect: 0, probe: 0 };
  D.scene.traverseVisible((l) => {
    if (!l.isLight || !l.layers.test(D.camera.layers)) return;
    if (${skipKillcam} && /^killcamLight/.test(l.name || '')) return;
    if (l.isDirectionalLight) { n.dir++; if (l.castShadow) n.dirShadow++; }
    else if (l.isSpotLight) { n.spot++; if (l.castShadow) n.spotShadow++; if (l.map) n.spotMap++; }
    else if (l.isPointLight) { n.point++; if (l.castShadow) n.pointShadow++; }
    else if (l.isHemisphereLight) n.hemi++; else if (l.isRectAreaLight) n.rect++; else if (l.isLightProbe) n.probe++;
  });
  return 'dir ' + n.dir + '/' + n.dirShadow + ' spot ' + n.spot + '/' + n.spotShadow + '/' + n.spotMap + ' point ' + n.point + '/' + n.pointShadow
    + ' hemi ' + n.hemi + ' rect ' + n.rect + ' probe ' + n.probe;
})()`;
const PAGE_SIGNATURE = signatureScript(false);
const PAGE_GARAGE_SIGNATURE = signatureScript(true);
// the terrain's programs at reveal: the splat material's (the program a fold makes per map) and every one (the horizon ring
// finishes after the props and may take another material)
const PAGE_TERRAIN_PROGRAMS = `(() => {
  const D = window.__DEBUG, terrain = D.world?.group?.children.find((c) => c.name === 'terrain'), all = new Set(), splat = new Set();
  terrain?.traverse((o) => {
    if (!o.isMesh || !o.material || Array.isArray(o.material)) return;
    const p = D.renderer.properties.get(o.material).currentProgram;
    if (!p) return;
    all.add(p.id);
    if (/world-terrain-splat/.test(o.material.customProgramCacheKey?.() ?? '')) splat.add(p.id);
  });
  const sort = (set) => [...set].sort((a, b) => a - b);
  return { splat: sort(splat), all: sort(all) };
})()`;
const PAGE_STATE = `(() => {
  const D = window.__DEBUG;
  return {
    phase: D.game.phase, timeS: D.game.timeS, loaderOn: !!document.querySelector('.cot-bl')?.classList.contains('on'),
    percent: Number(document.querySelector('.cot-bl [aria-valuenow]')?.getAttribute('aria-valuenow') ?? -1),
    warm: window.__WORLD_PROGRAM_WARM ? { ...window.__WORLD_PROGRAM_WARM } : null,
    poolAttached: D.nightLighting?.poolAttached ?? null, gpu: D.garageGpuResidency ?? null,
    contextLost: D.renderer.getContext().isContextLost(), studio: !!window.__STUDIO?.active,
    garageEntry: window.__GARAGE_ENTRY ? { totalMs: window.__GARAGE_ENTRY.totalMs ?? null, presentationUnready: window.__GARAGE_ENTRY.presentationUnready ?? null } : null,
  };
})()`;

const report = { dist, mapId, spec, control, paths: {} };
let failures = 0;
const check = (record, ok, what) => {
  (record.checks ||= []).push(`${ok ? 'ok' : 'FAIL'} ${what}`);
  if (!ok && !control) failures++;
};
const state = (page) => page.evaluate(PAGE_STATE);

async function openPage(browser, port, { failMinimap = false } = {}) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e?.message ?? e).slice(0, 300)));
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  if (failMinimap) {
    // the minimap request is held, then failed by the caller (abortHeld) once the world build is past its terrain
    page.__held = [];
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      if (page.__failMinimap !== false && /\/minimaps\/[^/?]+\.webp/.test(request.url())) page.__held.push(request);
      else request.continue();
    });
  }
  await page.goto(`http://127.0.0.1:${port}/?nosplash=1&debug=1&telemetry=off`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 300000, polling: 200 });
  await sleep(2500);
  return { page, errors };
}

/** Starts a solo entry; returns when it plays (3 s of sim clock), settles in the Garage, or times out. */
async function enter(page, { onTick = null, timeoutMs = 240000 } = {}) {
  await page.evaluate((request) => {
    window.__ZW = { done: false, error: null };
    Promise.resolve().then(() => window.__DEBUG.beginSoloBattle(request))
      .then(() => { window.__ZW.done = true; }, (e) => { window.__ZW.done = true; window.__ZW.error = String(e?.stack ?? e).slice(0, 400); });
  }, { specId: spec, mapId, randomRoster: false });
  const deadline = Date.now() + timeoutMs;
  let playingSince = null, firstT = null, last = null;
  while (Date.now() < deadline) {
    last = { ...(await state(page)), entry: await page.evaluate(() => ({ ...window.__ZW })) };
    if (onTick) await onTick(last);
    const playing = last.phase === 'battle' && !last.loaderOn && typeof last.timeS === 'number';
    if (playing) {
      playingSince ??= Date.now(); firstT ??= last.timeS;
      if (Date.now() - playingSince > 3000 && last.timeS > firstT) return { outcome: 'played', last };
    } else { playingSince = null; firstT = null; }
    if (last.entry.done && last.phase === 'garage' && !last.loaderOn && last.garageEntry?.presentationUnready === false) {
      return { outcome: 'garage', last };
    }
    await sleep(100);
  }
  return { outcome: 'timeout', last };
}

async function entryPath(browser, port) {
  const record = {};
  const { page, errors } = await openPage(browser, port);
  try {
    const result = await enter(page);
    record.outcome = result.outcome;
    record.warm = result.last?.warm ?? null;
    record.signature = await page.evaluate(PAGE_SIGNATURE);
    record.terrainPrograms = await page.evaluate(PAGE_TERRAIN_PROGRAMS);
    check(record, result.outcome === 'played', 'the entry plays');
    if (!control) {
      check(record, record.warm?.status === 'drawn', `the warm drew (${record.warm?.status})`);
      check(record, record.warm?.signature === record.signature, `it compiled under the revealed battle's signature (${record.warm?.signature} / ${record.signature})`);
      const { splat, all } = record.terrainPrograms;
      check(record, splat.length > 0 && splat.every((id) => record.warm?.programIds?.includes(id)),
        `the battle draws the terrain splat with the warm's program (${splat} within ${record.warm?.programIds})`);
      record.terrainProgramsOutsideWarm = all.filter((id) => !record.warm?.programIds?.includes(id));
    }
  } finally {
    record.errors = errors.slice(0, 8);
    check(record, errors.length === 0, `no page errors (${errors.length})`);
    await page.close().catch(() => {});
  }
  return record;
}

async function failedPath(browser, port) {
  const record = {};
  const { page, errors } = await openPage(browser, port, { failMinimap: true });
  try {
    const garageSignature = await page.evaluate(PAGE_GARAGE_SIGNATURE);
    const startedAt = Date.now();
    const failed = await enter(page, {
      timeoutMs: 180000,
      onTick: async (st) => {
        if (!page.__held.length || (st.percent < 36 && Date.now() - startedAt < 60000)) return;
        record.failedAt = { percent: st.percent, warm: st.warm?.status ?? null };
        for (const request of page.__held.splice(0)) await request.abort('failed').catch(() => {});
      },
    });
    record.outcome = failed.outcome;
    await sleep(1000); // a warm stops at its next poll after the Garage's disarm
    record.warmAfterFailure = (await state(page)).warm;
    if (!control && record.warmAfterFailure) {
      check(record, record.warmAfterFailure.status !== 'linking' && record.warmAfterFailure.status !== 'waiting-for-lights',
        `the warm stopped with the entry (${record.warmAfterFailure.status})`);
    }
    record.garageSignature = garageSignature;
    record.signatureAfter = await page.evaluate(PAGE_GARAGE_SIGNATURE);
    const after = await state(page);
    record.poolAttached = after.poolAttached;
    record.gpu = after.gpu;
    check(record, failed.outcome === 'garage', `the failed entry returned to the Garage (${failed.outcome})`);
    check(record, record.signatureAfter === garageSignature, `the Garage's own light signature is back (${record.signatureAfter} / ${garageSignature})`);
    check(record, after.poolAttached !== true, 'the night pool is detached');
    check(record, after.gpu?.suspended === false, 'the Garage GPU residency is restored');
    // the next entry, the transfer healthy again
    page.__failMinimap = false;
    const retry = await enter(page);
    record.retryOutcome = retry.outcome;
    record.retryWarm = retry.last?.warm ?? null;
    check(record, retry.outcome === 'played', `the next entry plays (${retry.outcome})`);
    if (!control) check(record, record.retryWarm?.status === 'drawn', `the next entry's warm drew (${record.retryWarm?.status})`);
  } finally {
    record.errors = errors.slice(0, 8);
    await page.close().catch(() => {});
  }
  return record;
}

async function contextPath(browser, port) {
  const record = {};
  const { page, errors } = await openPage(browser, port);
  try {
    let lost = false;
    const result = await enter(page, {
      onTick: async (st) => {
        // after the terrain stands (33 % of the loader) and before the world is done (55 %)
        if (lost || st.percent < 36 || st.percent > 54) return;
        lost = true;
        record.lostAt = { percent: st.percent, warm: st.warm?.status ?? null };
        await page.evaluate(() => {
          const ext = window.__DEBUG.renderer.getContext().getExtension('WEBGL_lose_context');
          window.__ZW_LOSE = ext;
          ext.loseContext();
          setTimeout(() => ext.restoreContext(), 500);
        });
      },
      timeoutMs: 300000,
    });
    record.outcome = result.outcome;
    record.injected = lost;
    record.warm = result.last?.warm ?? null;
    record.contextLostAtEnd = result.last?.contextLost ?? null;
    check(record, lost, 'the context was lost during the build');
    check(record, result.outcome === 'played' || result.outcome === 'garage', `the entry ended (${result.outcome})`);
    if (!control && record.warm) {
      check(record, ['abandoned', 'drawn', 'link-timeout', 'signature-moved'].includes(record.warm.status),
        `the warm stopped (${record.warm.status}${record.warm.error ? `: ${record.warm.error}` : ''})`);
    }
    if (result.outcome === 'garage') {
      const retry = await enter(page);
      record.retryOutcome = retry.outcome;
      record.retryWarm = retry.last?.warm ?? null;
      check(record, retry.outcome === 'played', `the next entry plays (${retry.outcome})`);
    }
  } finally {
    record.errors = errors.slice(0, 8);
    await page.close().catch(() => {});
  }
  return record;
}

async function studioPath(browser, port) {
  const record = {};
  const { page, errors } = await openPage(browser, port);
  try {
    const before = await page.evaluate(() => (window.__WORLD_PROGRAM_WARM ? { ...window.__WORLD_PROGRAM_WARM } : null));
    await page.keyboard.press('F8');
    await page.waitForFunction(() => window.__STUDIO?.active === true, { timeout: 180000, polling: 200 });
    await sleep(3000);
    record.studioWarm = await page.evaluate(() => (window.__WORLD_PROGRAM_WARM ? { ...window.__WORLD_PROGRAM_WARM } : null));
    check(record, JSON.stringify(record.studioWarm) === JSON.stringify(before), 'the Studio\'s world builds are never warmed');
    await page.evaluate(() => window.__STUDIO.exit());
    await page.waitForFunction(() => window.__DEBUG.game.phase === 'garage' && !window.__STUDIO?.active, { timeout: 120000, polling: 200 });
    await sleep(2000);
    record.garageAfterStudio = await page.evaluate(PAGE_SIGNATURE);
    const result = await enter(page);
    record.outcome = result.outcome;
    record.warm = result.last?.warm ?? null;
    check(record, result.outcome === 'played', `the battle entry after the Studio plays (${result.outcome})`);
    if (!control) check(record, record.warm?.status === 'drawn', `its warm drew (${record.warm?.status})`);
  } finally {
    record.errors = errors.slice(0, 8);
    check(record, errors.length === 0, `no page errors (${errors.length})`);
    await page.close().catch(() => {});
  }
  return record;
}

const RUN = { entry: entryPath, failed: failedPath, context: contextPath, studio: studioPath };
await withDistProbeSession({ root: process.cwd(), dist, launch: { width: 1280, height: 800 } }, async ({ browser, port }) => {
  for (const name of paths) {
    const run = RUN[name];
    if (!run) throw new Error(`unknown path ${name}`);
    try { report.paths[name] = await run(browser, port); }
    catch (error) { report.paths[name] = { error: String(error?.stack ?? error).slice(0, 600) }; failures++; }
    const record = report.paths[name];
    console.log(`[${tag}] ${name}: ${record.outcome ?? 'error'}${record.error ? ` ${record.error.slice(0, 200)}` : ''}`);
    for (const line of record.checks ?? []) console.log(`    ${line}`);
    writeFileSync(path.join(out, `world-program-warm-${tag}.json`), JSON.stringify(report, null, 1));
  }
});
console.log(failures ? `world-program-warm.browser: ${failures} failure(s)` : `world-program-warm.browser: ${paths.join(', ')} PASS${control ? ' (control: outcomes only)' : ''}`);
process.exit(failures ? 1 : 0);
