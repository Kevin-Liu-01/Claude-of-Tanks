#!/usr/bin/env node
// The sniper frame is drawn at the zoom the sight reports (278, scope-and-names: the Reddit capture lane read its prod
// Proving Ground stills, scoped "SNIPER x16", as the wide third-person view).
// Copyright (c) 2026 Kevin B. Liu. First-party tool; see NOTICE.md.
//
// Reads what is drawn, not the camera: in a Proving Ground battle (Leopard 2A6, Kestrel Airfield) the sight is entered
// and zoomed by real input (Shift, wheel-in or a held right button on the desktop; the SCOPE control on a phone) and
// laid on a lane target at that zoom. A calibration target, a flat-colour square 4 m across at 300 m on the view axis
// (larger where 4 m would draw under CAL_MIN_PX, by the reported lens)
// (drawn over everything), is shot drawn, hidden, drawn again: the pixels that carry its tint (the frame's air and grade
// wash it to a pale pink) only while it is drawn are the square, and its drawn size, the larger side (HUD readouts over
// it only shorten one), is held to the size the reported zoom predicts (BASE_FOV 60 / zoom, cameraRig.ts) within
// [MIN_RATIO, MAX_RATIO]. A frame drawn at the chase lens (60 degrees) while the sight says x8 draws it
// at an eighth of that and fails; so does a zoom drawn one step short (half). The `capture` input is the Reddit capture's
// own staging (Shift, then __DEBUG.rig.snapSniper(16)). The arcade frame before each entry is measured for the report.
// Each page asks for the player's path (?debug=1 for the QA surface, as any player may), except `capture` (the harness
// path a capture tool's page takes).
//   node tools/sniper-zoom-drawn.browser.selftest.mjs [--dist=dist] [--headed] [--views=desktop,phone]
//     [--inputs=shift,wheel,rmb,capture] [--shots=<dir>] [--json=<out>]
// --dist serves a built release (vite preview); without it the dev server. It takes the capture lock's render class.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer';
import { launchGuardedBrowser } from './browser-launch.mjs';
import { openCaptureHold, startViteChild } from './capture-hold.mjs';
import { assertAutomationPath, readinessExpression, requestAutomationPath } from './game-readiness.mjs';
import { decodePng } from './hud-ammo-frame-ink.mjs';
import { nativeBrowserLaunchOptions, verifyNativeBrowserLaunch } from './native-browser-launch.mjs';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const DIST = arg('dist', null);
const HEADED = process.argv.includes('--headed');
const VIEWS = arg('views', 'desktop,phone').split(',').filter(Boolean);
const INPUTS = arg('inputs', 'shift,wheel,rmb,capture').split(',').filter(Boolean);
const SHOTS = arg('shots', null);
const JSON_OUT = arg('json', null);
/** cameraRig.ts BASE_FOV_DEG: the sniper lens is BASE_FOV_DEG / zoom (vertical). */
const BASE_FOV_DEG = 60;
// The drawn size against the predicted: a flat square perpendicular to the axis projects exactly, so the band is the
// render scale's resampling and the bloom's edge; a lens one zoom step wide reads 0.5 and the chase lens 1/zoom.
const MIN_RATIO = 0.88;
const MAX_RATIO = 1.12;
const MIN_DRAWN_PX = 14;
/** The calibration target: a square this many metres across, this far down the view axis. */
const CAL_SIZE_M = 4;
const CAL_RANGE_M = 300;
/** The fewest pixels the square is read at: smaller, it is scaled up to this (by the reported lens). */
const CAL_MIN_PX = 40;
const VIEWPORTS = {
  desktop: { viewport: { width: 1920, height: 1080, deviceScaleFactor: 1 } },
  phone: {
    viewport: { width: 892, height: 412, isMobile: true, hasTouch: true, isLandscape: true, deviceScaleFactor: 2 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1',
  },
};
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const report = { protocol: 'sniper-zoom-drawn-v1', dist: DIST, headed: HEADED, cases: [], notRun: [], errors: [], ok: false };

/** The inputs each view runs: the desktop's three entries and the capture's staging; the phone's SCOPE control. */
function inputsFor(view) {
  if (view === 'phone') return INPUTS.includes('capture') ? ['scope', 'capture'] : ['scope'];
  return INPUTS;
}

async function openBattle(browser, baseUrl, view, path) {
  const page = await browser.newPage();
  const spec = VIEWPORTS[view];
  if (spec.userAgent) await page.emulate(spec); else await page.setViewport(spec.viewport);
  page.on('pageerror', (error) => { if (report.errors.length < 20) report.errors.push(`${view} pageerror: ${String(error?.message ?? error).slice(0, 300)}`); });
  if (path === 'player') await requestAutomationPath(page, 'player');
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem('cot.telemetry', 'off');
      // the armour overlay paints the target's plates in its own pass: off, so hiding the hull hides all of it
      localStorage.setItem('cot.settings.v1', JSON.stringify({ armorAimOverlay: false, aiDifficulty: 'easy', revision: 2 }));
      localStorage.setItem('cot.armourOverlayDefault.v1', 'done');
    } catch { /* no storage */ }
  });
  const tier = view === 'phone' ? '' : '&tier=desktop';
  await page.goto(`${baseUrl}/?nosplash=1&telemetry=off&debug=1${tier}`, { waitUntil: 'domcontentloaded', timeout: 300_000 });
  // the player's path keeps the boot's entry gate: press through it (a player's click) until the Garage settles
  const garage = `${readinessExpression('garage')} && !!window.__DEBUG`;
  const until = Date.now() + 600_000;
  while (!(await page.evaluate(garage).catch(() => false))) {
    if (Date.now() > until) throw new Error(`${view}: the Garage never settled`);
    await page.evaluate(() => document.querySelector('.cot-boot-enter, [data-boot-enter], .boot-enter')?.click()).catch(() => {});
    await sleep(1000);
  }
  if (path === 'player') await assertAutomationPath(page, 'player', { label: `sniper-zoom-drawn ${view}` });
  await page.evaluate(() => {
    setTimeout(() => window.__DEBUG.beginSoloBattle({ specId: 'leo2a6', mapId: 'airfield', gameMode: 'proving_ground', randomRoster: false }), 0);
  });
  await page.waitForFunction(readinessExpression('controlsReleased'), { timeout: 900_000, polling: 1000 });
  await sleep(2500);
  // ?debug=1 opens the Battle Diagnostics panel, which on a phone covers the right thumb's controls (SCOPE among them):
  // its own close, as a player closes it
  const close = await page.$('.ph-close');
  if (close) { await close.click(); await sleep(500); }
  if (view !== 'phone') {
    // a headed window that is not the system's key window is refused the lock: the page is told it has focus
    const cdp = await page.createCDPSession();
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
    await cdp.detach();
    // a player clicks into the battle, which takes the pointer lock the wheel needs (input.ts onWheel: without the lock
    // the wheel belongs to the UI under the cursor; a headless browser is denied the lock and aims by cursor instead)
    await page.bringToFront();
    const box = await page.evaluate(() => {
      const r = window.__DEBUG.renderer.domElement.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.mouse.click(box.x, box.y);
    await sleep(800);
  }
  return page;
}

const pointerState = (page) => page.evaluate(() => ({ locked: !!document.pointerLockElement,
  cursorAim: !!window.__DEBUG.input?.isCursorAim?.() }));

/** Pick the lane target nearest 300 m and remember it on the page. */
async function pickTarget(page) {
  return page.evaluate(() => {
    const G = window.__DEBUG.game, P = G.player;
    const range = (x) => x.state.pos.distanceTo(P.state.pos);
    const lanes = G.tanks.filter((x) => x.team !== P.team && !x.combat?.destroyed && x.visual?.root);
    const t = lanes.sort((a, b) => Math.abs(range(a) - 300) - Math.abs(range(b) - 300))[0];
    if (!t) return null;
    window.__szd = { id: t.id };
    return { id: t.id, specId: t.specId, rangeM: Math.round(range(t)) };
  });
}

/** Lay the sight on the target at the zoom the input chose (the mode and zoom stay the input's; only the aim is staged,
 *  and every frame after it is the rig's own per-frame solve). */
async function layOnTarget(page) {
  await page.evaluate(() => {
    const D = window.__DEBUG, G = D.game, P = G.player, t = G.tanks.find((x) => x.id === window.__szd.id);
    const muzzle = P.state.pos.clone(); muzzle.y += P.spec.dims.heightM * 0.8;
    const centre = t.state.pos.clone(); centre.y += t.spec.dims.heightM * 0.5;
    const v = centre.sub(muzzle);
    if (D.rig.mode === 'SNIPER') D.rig.snapSniper(D.rig.zoom, Math.atan2(v.x, v.z), Math.atan2(v.y, Math.hypot(v.x, v.z)));
  });
}

const rigState = (page) => page.evaluate(() => ({ mode: window.__DEBUG.rig.mode, zoom: window.__DEBUG.rig.zoom,
  fov: window.__DEBUG.camera.fov, scoped: !!window.__DEBUG.camera.userData.scoped }));

async function tap(page, selector) {
  const el = await page.$(selector);
  if (!el) throw new Error(`missing ${selector}`);
  const r = await el.boundingBox();
  if (!r) throw new Error(`hidden ${selector}`);
  const cdp = await page.createCDPSession();
  const point = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await sleep(90);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

/** Enter the sight by the input under test; returns a release() for a held input. */
async function enterSight(page, input) {
  const centre = await page.evaluate(() => ({ x: innerWidth / 2, y: innerHeight / 2 }));
  if (input === 'shift') {
    await page.keyboard.press('ShiftLeft'); await sleep(400);
    for (let k = 0; k < 2; k++) { await page.mouse.move(centre.x, centre.y); await page.mouse.wheel({ deltaY: -120 }); await sleep(350); }
  } else if (input === 'wheel') {
    await page.mouse.move(centre.x, centre.y);
    for (let k = 0; k < 14; k++) {
      const s = await rigState(page);
      if (s.mode === 'SNIPER' && s.zoom >= 8) break;
      await page.mouse.wheel({ deltaY: -120 }); await sleep(300);
    }
  } else if (input === 'rmb') {
    await page.mouse.move(centre.x, centre.y);
    await page.mouse.down({ button: 'right' });
    return async () => { await page.mouse.up({ button: 'right' }); };
  } else if (input === 'scope') {
    // what the finger lands on: the first pointerdown's target, so a covered button names its cover
    await page.evaluate(() => {
      window.__szdTap = [];
      document.addEventListener('pointerdown', (e) => {
        window.__szdTap.push(`${e.pointerType}:${e.target?.className?.baseVal ?? e.target?.className ?? e.target?.tagName}`);
      }, { capture: true, once: true });
    });
    await tap(page, '.cot-touch .scope');
    await sleep(600);
    if ((await rigState(page)).mode !== 'SNIPER') {
      const r = await (await page.$('.cot-touch .scope')).boundingBox();
      await page.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2);
    }
  } else if (input === 'capture') {
    // armor.mjs (the Reddit capture): Shift, then the staged sight at x16 on the target's centre
    await page.keyboard.press('ShiftLeft'); await sleep(400);
    await page.evaluate(() => {
      const D = window.__DEBUG, G = D.game, P = G.player, t = G.tanks.find((x) => x.id === window.__szd.id);
      const muzzle = P.state.pos.clone(); muzzle.y += P.spec.dims.heightM * 0.8;
      const centre = t.state.pos.clone(); centre.y += t.spec.dims.heightM * 0.5;
      const v = centre.sub(muzzle);
      D.rig.snapSniper(16, Math.atan2(v.x, v.z), Math.atan2(v.y, Math.hypot(v.x, v.z)));
    });
  } else throw new Error(`unknown input ${input}`);
  return async () => {};
}

async function leaveSight(page) {
  for (let k = 0; k < 3 && (await rigState(page)).mode === 'SNIPER'; k++) { await page.keyboard.press('ShiftLeft'); await sleep(500); }
  if ((await rigState(page)).mode === 'SNIPER') await page.evaluate(() => window.__DEBUG.rig.exitSniper(true));
  await sleep(600);
}

/** The calibration target: a flat-colour square CAL_SIZE_M across, CAL_RANGE_M down the view axis, facing the camera,
 *  drawn over everything (no depth test, no fog, no tone mapping) so nothing occludes or tints it. Built from the
 *  page's own three.js classes (a release build bundles them): a scene mesh's class and geometry, a cloned basic
 *  material. `drawn` false hides it. */
const setCalibration = (page, drawn, scale = 1) => page.evaluate(async ({ drawn, range, size, scale }) => {
  const D = window.__DEBUG, scene = D.scene, cam = D.camera;
  let cal = window.__szdCal;
  if (!cal) {
    // a plain Mesh with a plain BufferGeometry (an InstancedMesh's class built without a count draws nothing) and a
    // fresh basic material of the page's own class (a clone would carry a scene material's hooks)
    let basic = null, plain = null;
    scene.traverse((o) => {
      if (!o.isMesh || o.type !== 'Mesh' || o.isInstancedMesh || o.isSkinnedMesh || o.isBatchedMesh) return;
      if (!plain && o.geometry?.type === 'BufferGeometry' && o.geometry.attributes?.position) plain = o;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      if (!basic && m?.type === 'MeshBasicMaterial') basic = m;
    });
    if (!plain || !basic) throw new Error('no plain scene mesh or basic material to build the calibration target from');
    const geo = new plain.geometry.constructor();
    const h = size / 2;
    geo.setAttribute('position', new plain.geometry.attributes.position.constructor(
      new Float32Array([-h, -h, 0, h, -h, 0, h, h, 0, -h, -h, 0, h, h, 0, -h, h, 0]), 3));
    const mat = new basic.constructor({ color: 0xff00ff, fog: false, depthTest: false, depthWrite: false, toneMapped: false,
      side: 2 });
    cal = new plain.constructor(geo, mat);
    cal.renderOrder = 1e9;
    cal.frustumCulled = false;
    cal.layers.mask = cam.layers.mask & 1 ? 1 : cam.layers.mask & -cam.layers.mask; // a layer the camera draws
    cal.name = 'sniper-zoom-drawn calibration';
    scene.add(cal);
    window.__szdCalBuilt = { mesh: plain.constructor.name, geometry: plain.geometry.constructor.name,
      material: basic.constructor.name, cameraLayers: cam.layers.mask, layers: cal.layers.mask };
    window.__szdCal = cal;
  }
  cam.updateMatrixWorld();
  const dir = cam.getWorldDirection(cal.position.clone());
  cal.position.copy(cam.position).addScaledVector(dir, range);
  cal.quaternion.copy(cam.quaternion);
  cal.scale.setScalar(scale);
  cal.visible = drawn;
  cal.updateMatrixWorld(true);
  const info = D.renderer?.info?.render;
  const frame0 = info?.frame ?? null;
  let calls = 0, drawsCal = 0;
  const onDraw = () => { drawsCal++; };
  cal.onAfterRender = onDraw;
  for (let k = 0; k < 4; k++) {
    await new Promise((done) => requestAnimationFrame(() => done()));
    calls = Math.max(calls, info?.calls ?? 0);
  }
  cal.onAfterRender = Object.getPrototypeOf(cal).onAfterRender;
  const ndc = cal.getWorldPosition(cal.position.clone()).project(cam);
  // what the page did while the target was set: frames rendered, the target's own draws, where it projects
  const seen = { frames: frame0 == null ? null : info.frame - frame0, calls, drawsCal, inScene: cal.parent === scene,
    ndc: [+ndc.x.toFixed(3), +ndc.y.toFixed(3), +ndc.z.toFixed(4)], autoUpdate: scene.matrixWorldAutoUpdate };
  return { rangeM: cam.position.distanceTo(cal.position), viewW: innerWidth, viewH: innerHeight, built: window.__szdCalBuilt,
    seen };
}, { drawn, range: CAL_RANGE_M, size: CAL_SIZE_M, scale });

/** The calibration target's drawn rectangle in device pixels: its tint where it is drawn, gone when it hides, back
 *  when it is drawn again (HUD marks over it leave holes, which the span below bridges). */
async function drawnCalibration(page, clip, scale) {
  const shoot = async () => decodePng(Buffer.from(await page.screenshot({ clip, captureBeyondViewport: false })));
  await setCalibration(page, true, scale);
  const a = await shoot();
  await setCalibration(page, false, scale);
  const b = await shoot();
  await setCalibration(page, true, scale);
  const c = await shoot();
  await setCalibration(page, false, scale);
  // the frame's air and grade wash the square to a pale pink (about 225, 185, 225 at 300 m): red and blue over green
  const magenta = (img, i) => img.data[i] - img.data[i + 1] > 20 && img.data[i + 2] - img.data[i + 1] > 20;
  const { width, height } = a;
  const rows = new Uint16Array(height), cols = new Uint16Array(width);
  let changed = 0, drawnMagenta = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (!magenta(a, i)) continue;
      drawnMagenta++;
      if (!magenta(b, i) && magenta(c, i)) { rows[y]++; cols[x]++; changed++; }
    }
  }
  // the square's rows and columns are solid: a run of at least a quarter of the busiest line, so stray pixels cannot
  // stretch the span
  const span = (counts) => {
    const floor = Math.max(2, Math.max(...counts) / 4);
    let lo = -1, hi = -1;
    counts.forEach((n, k) => { if (n >= floor) { if (lo < 0) lo = k; hi = k; } });
    return lo < 0 ? 0 : hi - lo + 1;
  };
  return { heightPx: span(rows), widthPx: span(cols), changedPx: changed, drawnMagentaPx: drawnMagenta };
}

async function measure(page, label) {
  const s = await rigState(page);
  const dpr = await page.evaluate(() => devicePixelRatio);
  const geo = await setCalibration(page, false);
  const zoom = s.mode === 'SNIPER' ? s.zoom : null;
  const lensDeg = zoom ? BASE_FOV_DEG / zoom : s.fov;
  // a square too small to read (the phone's x2 draws 4 m at 10 px, where a pixel is a tenth) grows to CAL_MIN_PX by
  // the reported lens: a frame drawn wider than that lens still draws it short and fails the ratio
  const at4m = (geo.viewH * CAL_SIZE_M) / (2 * geo.rangeM * Math.tan((lensDeg * Math.PI) / 360));
  const scale = Math.max(1, CAL_MIN_PX / at4m);
  const predictedPx = at4m * scale;
  const half = Math.ceil(Math.max(60, predictedPx * 1.5));
  const clip = { x: Math.max(0, Math.floor(geo.viewW / 2 - half)), y: Math.max(0, Math.floor(geo.viewH / 2 - half)) };
  clip.width = Math.min(geo.viewW, Math.ceil(geo.viewW / 2 + half)) - clip.x;
  clip.height = Math.min(geo.viewH, Math.ceil(geo.viewH / 2 + half)) - clip.y;
  const drawn = await drawnCalibration(page, clip, scale);
  const seenDrawn = (await setCalibration(page, true, scale)).seen;
  await setCalibration(page, false);
  if (SHOTS) {
    mkdirSync(SHOTS, { recursive: true });
    await setCalibration(page, true, scale);
    writeFileSync(resolve(SHOTS, `${label}-calibration.png`), Buffer.from(await page.screenshot({ captureBeyondViewport: false })));
    await setCalibration(page, false);
    writeFileSync(resolve(SHOTS, `${label}.png`), Buffer.from(await page.screenshot({ captureBeyondViewport: false })));
  }
  // the larger side: HUD readouts drawn over the square (the reload timer, the ammunition line) only shorten a side
  const drawnPx = Math.max(drawn.heightPx, drawn.widthPx) / dpr;
  return { label, ...s, rangeM: +geo.rangeM.toFixed(1), calM: +(CAL_SIZE_M * scale).toFixed(2), lensDeg: +lensDeg.toFixed(3), predictedPx: +predictedPx.toFixed(1),
    drawnPx: +drawnPx.toFixed(1), drawnHeightPx: +(drawn.heightPx / dpr).toFixed(1), drawnWidthPx: +(drawn.widthPx / dpr).toFixed(1), changedPx: drawn.changedPx, magentaPx: drawn.drawnMagentaPx, built: geo.built, seen: seenDrawn,
    ratio: +(drawnPx / predictedPx).toFixed(3) };
}

let browser, server, hold;
try {
  hold = await openCaptureHold({ label: 'sniper-zoom-drawn.browser.selftest', place: 'sniper-zoom-drawn', lockClass: 'render', timeoutMs: 45 * 60_000 });
  server = await startViteChild({ root: process.cwd(), mode: DIST ? 'preview' : 'dev', outDir: DIST ?? 'dist' });
  report.server = server.url;
  browser = await launchGuardedBrowser(puppeteer, nativeBrowserLaunchOptions({ headless: HEADED ? false : 'new', timeout: 120_000,
    protocolTimeout: 600_000, defaultViewport: null, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist',
      '--no-sandbox', '--disable-dev-shm-usage', '--window-size=1920,1200'] }), { label: 'sniper-zoom-drawn' });
  report.launch = verifyNativeBrowserLaunch(browser);
  for (const view of VIEWS) {
    for (const path of ['player', 'harness']) {
      const inputs = inputsFor(view).filter((input) => (path === 'harness') === (input === 'capture'));
      if (!inputs.length) continue;
      const page = await openBattle(browser, server.url, view, path);
      const target = await pickTarget(page);
      assert.ok(target, `${view}: no lane target`);
      for (const input of inputs) {
        const label = `${view}-${input}`;
        if (HEADED && input === 'wheel' && !(await pointerState(page)).locked && !(await pointerState(page)).cursorAim) {
          // the wheel steps the zoom only under the pointer lock (or the cursor-aim fallback a denied lock latches). A
          // headed automated window that is not the system's key window is refused the lock without a denial, so its
          // wheel reaches the UI, as a player's does before clicking in: reported, not failed. The headless run takes the
          // lock by the same click and walks the wheel.
          report.notRun.push({ case: label, why: 'this headed window was refused the pointer lock the wheel needs' });
          console.log(`[sniper-zoom-drawn] ${label}: not run (the headed window holds no pointer lock)`);
          continue;
        }
        await leaveSight(page);
        const arcade = await measure(page, `${label}-arcade`);
        const release = await enterSight(page, input);
        await sleep(600);
        if (input !== 'capture') await layOnTarget(page);
        await sleep(1500);
        const sight = await measure(page, label);
        await release();
        const pointer = view === 'phone' ? { taps: await page.evaluate(() => window.__szdTap ?? null) } : await pointerState(page);
        report.cases.push({ view, path, input, target, arcade, sight, pointer });
        console.log(`[sniper-zoom-drawn] ${label}: ${JSON.stringify(sight)} (arcade ${arcade.drawnPx ?? '-'} px; ${JSON.stringify(report.cases.at(-1).pointer)})`);
      }
      await page.close();
    }
  }
  for (const c of report.cases) {
    const s = c.sight, where = `${c.view} ${c.input}`;
    assert.equal(s.mode, 'SNIPER', `${where}: the input did not enter the sight (${s.mode}; ${JSON.stringify(c.pointer)})`);
    assert.ok(s.drawnPx >= MIN_DRAWN_PX, `${where}: the target drew ${s.drawnPx} px (predicted ${s.predictedPx} at x${s.zoom}; ${s.magentaPx} magenta px; built ${JSON.stringify(s.built)}; drawn ${JSON.stringify(s.seen)})`);
    assert.ok(s.ratio >= MIN_RATIO && s.ratio <= MAX_RATIO,
      `${where}: the target drew ${s.drawnPx} px, x${s.zoom} predicts ${s.predictedPx} px (ratio ${s.ratio}, wanted ${MIN_RATIO}-${MAX_RATIO})`);
  }
  assert.ok(report.cases.length > 0, 'no case ran');
  report.ok = true;
} catch (error) {
  report.errors.push(String(error?.stack ?? error));
} finally {
  if (browser) await browser.close().catch((error) => report.errors.push(`close: ${error}`));
  if (server) await server.close().catch(() => {});
  await hold?.release();
}
report.ok = report.ok && !report.errors.some((e) => !e.includes('pageerror'));
if (JSON_OUT) writeFileSync(JSON_OUT, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ok: report.ok, notRun: report.notRun, cases: report.cases.map((c) => ({ case: `${c.view}-${c.input}`, zoom: c.sight.zoom,
  drawnPx: c.sight.drawnPx, predictedPx: c.sight.predictedPx, ratio: c.sight.ratio, arcadePx: c.arcade.drawnPx })), errors: report.errors }, null, 2));
if (!report.ok) process.exitCode = 1;
else console.log(`sniper-zoom-drawn.browser.selftest: ${report.cases.length} sight entries drew the target at the reported zoom`
  + `${report.notRun.length ? ` (not run: ${report.notRun.map((n) => `${n.case}, ${n.why}`).join('; ')})` : ''} PASS`);
