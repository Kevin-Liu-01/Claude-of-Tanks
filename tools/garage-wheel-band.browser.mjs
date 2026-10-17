// garage-wheel-band.browser.mjs — the Garage running-gear band probe (2026-10-17, the wheel-band lane; the owner: "in
// garage, on all tanks, i can see this weird shadow on wheels, no matter what garage i switch through").
//
// The band: the Garage's dormant energy skin (juggernautVisual.ts, on every pedestal tank) drew raw clones of the
// vehicle's paint, which wrote neither the sun state nor the vehicle tag into the scene target's alpha, and the
// ground occlusion (vehicleGroundOcclusion.ts) took the untagged road wheels for ground under the hull: 45-60 8-bit
// levels darker below a straight line at the belly + 2 cm, untouched above it. This probe stages each Garage with each
// tank as the Garage itself does (the dormant skin installed by prepareVisual), poses beside the running gear and
// measures, per view:
//   tag      the share of the tank's pixels (an override pass of the tank alone) whose scene-target alpha carries the
//            vehicle tag (>= 3.5: 2 + sun visibility + 2), over the whole tank and in the strip under the belly line;
//   band     the darkening the ground occlusion adds (the same frame with __LIGHT_TUNE.VEHICLE_GROUND_AO = 0 minus the
//            frame) on the tank's pixels just under the belly line minus just over it, in 8-bit display levels, and
//            the frame / no-ground-AO luminance ratios under and over the line.
// --battle adds a daylight battle view of the player tank, plain and wearing the live energy skin (the Juggernaut's).
// --gate fails the run when a Garage view's band step reaches --max-step (default 4 levels) or its tag share under the
// line falls below --min-tag (default 0.8).
//
// Usage (worktree root):
//   node --max-old-space-size=4096 tools/garage-wheel-band.browser.mjs --out=<dir> [--root=<checkout>]
//     [--garages=verdant_motor_pool,desert_forward_depot,urban_arsenal] [--tanks=ztz99a2,leo2a4,m1a1_abrams_hc]
//     [--views=low,side] [--battle] [--battle-tank=ztz99a2] [--no-garage] [--gate] [--cap-min=18] [--lock-held]
// Takes the shared capture lock (tools/capture-lock.mjs) for the whole run (--lock-held: the caller holds it, a chain's
// lease) and stops before --cap-min minutes of hold; serves --root (default: the current directory) through its own
// vite dev server. Writes <out>/report.json and PNGs.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { createCaptureLock } from './capture-lock.mjs';

const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  return hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : true;
};
const list = (name, fallback) => String(flag(name, fallback)).split(',').map((s) => s.trim()).filter(Boolean);
const root = resolve(String(flag('root', process.cwd())));
const out = resolve(String(flag('out', resolve(root, '.qa-dev/garage-wheel-band'))));
const garages = flag('no-garage') ? [] : list('garages', 'verdant_motor_pool,desert_forward_depot,urban_arsenal');
const tanks = list('tanks', 'ztz99a2,leo2a4,m1a1_abrams_hc');
const viewNames = list('views', 'low,side');
const battleTank = String(flag('battle-tank', tanks[0]));
const gate = !!flag('gate');
const maxStep = Number(flag('max-step', 4));
const minTag = Number(flag('min-tag', 0.8));
const capMs = Number(flag('cap-min', 18)) * 60 * 1000;
const lockHeld = !!flag('lock-held');
const WIDTH = 1600, HEIGHT = 900;
mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(`[wheel-band ${new Date().toISOString().slice(11, 19)}]`, ...a);

/** Camera beside the near (+x) run: `low` is the owner's framing (low and close, the skirt over the wheels). */
const VIEWS = {
  low: { dist: 3.4, up: 0.08, sz: 0.9, fov: 42, ty: 0.42 },
  side: { dist: 5.2, up: 0.9, sz: 1.2, fov: 38, ty: 0.55 },
};

const lock = createCaptureLock();
let heartbeat = null, server = null, browser = null;
const report = { root, garages, tanks, views: viewNames, gate: { maxStep, minTag }, garage: [], battle: [], errors: [] };
let failed = [];
try {
  if (!lockHeld) {
    log('waiting for the capture lock');
    await lock.acquire(5 * 60 * 60 * 1000);
    heartbeat = setInterval(() => lock.refresh(), 30_000);
    heartbeat.unref();
  }
  const heldAt = Date.now();
  const overCap = () => Date.now() - heldAt > capMs;
  log('capture lock held');
  server = await createServer({
    root, configFile: resolve(root, 'vite.config.ts'), logLevel: 'error',
    server: { host: '127.0.0.1', port: 5300 + (process.pid % 90), strictPort: false, hmr: false, watch: { ignored: ['**/*'] } },
    optimizeDeps: { entries: ['index.html'] },
  });
  await server.listen();
  const baseUrl = `http://127.0.0.1:${server.config.server.port}`;
  log('vite', baseUrl);
  browser = await puppeteer.launch({ headless: 'new', args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => report.errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|github|Failed to load resource/.test(m.text())) report.errors.push(m.text()); });
  if (garages.length) {
    await page.evaluateOnNewDocument((variant) => { try { localStorage.setItem('cot.garage.variant', variant); } catch {} }, garages[0]);
  }
  await page.goto(`${baseUrl}/?debug=1&nosplash=1&tier=desktop&gfxreset=1`, { waitUntil: 'domcontentloaded', timeout: 240_000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 300_000 });
  await sleep(2500);

  // ---- page-side probe: pose, frames, tank mask, scene-target alpha, display luminance
  await page.evaluate(async () => {
    const D = window.__DEBUG, R = D.renderer;
    // the game's own three (vite's optimised copy), from the module graph rather than a second instance
    const text = await (await fetch('/src/game/juggernautVisual.ts')).text();
    const threeUrl = text.match(/from\s+["']([^"']*\/three\.js(?:\?[^"']*)?)["']/)?.[1];
    const THREE = await import(threeUrl);
    const energy = await import('/src/game/juggernautVisual.ts');
    const P = window.__GWB = { mode: 'garage', pose: null, skin: null, target: null, lum: {}, THREE, energy };
    const setRT = R.setRenderTarget;
    R.setRenderTarget = function (t, ...rest) {
      if (t && t.texture && t.texture.name === 'SceneAAPass.color') P.target = t;
      return setRT.call(this, t, ...rest);
    };
    P.root = () => (P.mode === 'garage' ? D.pedestalVisual?.root : D.game.player?.visual?.root) ?? null;
    P.applySkin = () => {
      const r = P.root();
      if (P.skin === 'live' && r) energy.syncTankEnergyVisual(r, P.dims ?? {}, 1.12, 1, 1, 0, false, energy.TANK_ENERGY.juggernaut, false);
    };
    P.frame = () => {
      P.applySkin();
      const pose = P.pose;
      if (pose) {
        D.camera.position.copy(pose.pos); D.camera.fov = pose.fov; D.camera.lookAt(pose.target); D.camera.updateProjectionMatrix();
        if (P.mode !== 'garage') D.rig.setExternalPose?.(pose.pos, pose.target, pose.fov);
      }
      D.camera.updateMatrixWorld(true);
      D.lighting.setStaticPresentationDormant?.(false);
      D.lighting.update(true);
      D.post.render(1 / 60, 1 / 60);
    };
    P.frames = async (n) => { for (let i = 0; i < n; i++) { P.frame(); await new Promise((r) => requestAnimationFrame(r)); } };
    P.toggle = (tune) => { globalThis.__LIGHT_TUNE = { ...(tune ?? {}) }; try { D.post.pinDynScale?.(1); } catch {} };
    P.hideUi = (hide) => {
      let el = R.domElement;
      while (el && el !== document.body) {
        for (const sib of el.parentElement ? el.parentElement.children : []) {
          if (sib === el || sib.tagName === 'SCRIPT') continue;
          if (hide) { if (sib.dataset.gwbVis === undefined) sib.dataset.gwbVis = sib.style.visibility || ''; sib.style.visibility = 'hidden'; }
          else if (sib.dataset.gwbVis !== undefined) { sib.style.visibility = sib.dataset.gwbVis; delete sib.dataset.gwbVis; }
        }
        el = el.parentElement;
      }
    };
    /** Pose beside the run on side `sign`, from the tank's own mesh bounds (battle: the ground-AO hull record). */
    P.poseSide = (sign, o) => {
      const r = P.root(); r.updateMatrixWorld(true);
      const inv = r.matrixWorld.clone().invert(), p = new THREE.Vector3();
      let minX = Infinity, maxX = -Infinity, minY = Infinity, minZ = Infinity, maxZ = -Infinity;
      r.traverse((m) => {
        if (!m.isMesh || !m.geometry || !m.visible) return;
        if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
        const b = m.geometry.boundingBox; if (!b) return;
        for (let i = 0; i < 8; i++) {
          p.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).applyMatrix4(m.matrixWorld).applyMatrix4(inv);
          if (!Number.isFinite(p.x)) continue;
          minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
        }
      });
      const sh = r.userData.groundAoShape;
      if (P.mode !== 'garage' && sh) { minX = -sh.hx; maxX = sh.hx; minY = sh.y0; minZ = sh.fz0; maxZ = sh.fz1; }
      const halfW = sign > 0 ? maxX : -minX, zc = 0.5 * (minZ + maxZ), ty = minY + o.ty;
      const target = r.localToWorld(new THREE.Vector3(sign * halfW * 0.85, ty, zc));
      const pos = r.localToWorld(new THREE.Vector3(sign * (halfW + o.dist), ty + o.up, zc + o.sz));
      P.pose = { pos, target, fov: o.fov };
      return { pos: pos.toArray().map((v) => +v.toFixed(3)), target: target.toArray().map((v) => +v.toFixed(3)) };
    };
    /** The final frame's display luminance (Rec. 709 over the 8-bit sRGB values), read in the frame's own task. */
    P.captureLum = (name) => {
      P.frame();
      const c = R.domElement, cv = new OffscreenCanvas(c.width, c.height), cx = cv.getContext('2d', { willReadFrequently: true });
      cx.drawImage(c, 0, 0);
      const d = cx.getImageData(0, 0, c.width, c.height).data, lum = new Float32Array(c.width * c.height);
      for (let i = 0; i < lum.length; i++) lum[i] = 0.2126 * d[4 * i] + 0.7152 * d[4 * i + 1] + 0.0722 * d[4 * i + 2];
      P.lum[name] = { w: c.width, h: c.height, lum };
      return { w: c.width, h: c.height };
    };
    /** The tank alone (an unlit override pass on a layer of its own), at the canvas size: 1 where the tank covers. */
    P.tankMask = () => {
      const r = P.root(), c = R.domElement, layer = 31, saved = [];
      r.traverse((m) => { if (m.isMesh || m.isInstancedMesh || m.isBatchedMesh) { saved.push([m, m.layers.mask]); m.layers.enable(layer); } });
      const cam = D.camera, camMask = cam.layers.mask, scene = D.scene;
      const bg = scene.background, override = scene.overrideMaterial, fog = scene.fog;
      const white = P.white ??= new THREE.MeshBasicMaterial({ color: 0xffffff });
      const clear = R.getClearColor(new THREE.Color()), clearAlpha = R.getClearAlpha(), autoClear = R.autoClear;
      cam.layers.set(layer); scene.background = null; scene.overrideMaterial = white; scene.fog = null;
      R.setRenderTarget(null); R.setClearColor(0x000000, 1); R.autoClear = true;
      R.render(scene, cam);
      const cv = new OffscreenCanvas(c.width, c.height), cx = cv.getContext('2d', { willReadFrequently: true });
      cx.drawImage(c, 0, 0);
      const d = cx.getImageData(0, 0, c.width, c.height).data, mask = new Uint8Array(c.width * c.height);
      for (let i = 0; i < mask.length; i++) mask[i] = d[4 * i] > 128 ? 1 : 0;
      cam.layers.mask = camMask; scene.background = bg; scene.overrideMaterial = override; scene.fog = fog;
      R.setClearColor(clear, clearAlpha); R.autoClear = autoClear;
      for (const [m, mask0] of saved) m.layers.mask = mask0;
      P.mask = { w: c.width, h: c.height, mask };
      let n = 0; for (const v of mask) n += v;
      return n;
    };
    /** The scene target's alpha (2 + sun visibility for a lit pixel, + 2 on a tagged vehicle pixel; 1 unlit). */
    P.alpha = () => {
      P.frame();
      const T = P.target; if (!T) return null;
      const w = T.width, h = T.height, buf = new Uint16Array(w * h * 4);
      R.readRenderTargetPixels(T, 0, 0, w, h, buf);
      const half = (u) => { const e = (u >> 10) & 0x1f, f = u & 0x3ff, s = (u & 0x8000) ? -1 : 1;
        if (e === 0) return s * 6.103515625e-5 * (f / 1024); if (e === 31) return 99; return s * Math.pow(2, e - 15) * (1 + f / 1024); };
      const a = new Float32Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a[(h - 1 - y) * w + x] = half(buf[(y * w + x) * 4 + 3]);
      return { w, h, a };
    };
    /** The belly line (yb + 0.02, the ground occlusion's receiver gate) along the near run's outer face, on screen. */
    P.bellyLine = (sign, w, h) => {
      const r = P.root(), sh = r?.userData.groundAoShape;
      if (!sh) return null;
      r.updateMatrixWorld(true);
      const pts = [];
      for (let k = 0; k <= 32; k++) {
        const z = sh.fz0 + (sh.fz1 - sh.fz0) * (k / 32);
        const q = r.localToWorld(new THREE.Vector3(sign * (sh.xo ?? sh.hx), sh.yb + 0.02, z)).project(D.camera);
        if (q.z > 1) continue;
        pts.push([(q.x * 0.5 + 0.5) * w, (1 - (q.y * 0.5 + 0.5)) * h]);
      }
      pts.sort((p, q) => p[0] - q[0]);
      return { pts, shape: { hx: +sh.hx.toFixed(3), yb: +sh.yb.toFixed(3), y0: +sh.y0.toFixed(3), xo: +(sh.xo ?? sh.hx).toFixed(3) } };
    };
    /** Band and tag metrics over the tank's pixels just under / just over the belly line (2..26 px), whole tank too. */
    P.measure = (sign, base, ref) => {
      const L = P.lum[base], Lr = P.lum[ref], M = P.mask, A = P.alpha();
      if (!L || !Lr || !M || !A) return { error: 'missing frame' };
      const { w, h } = L, line = P.bellyLine(sign, w, h);
      const sx = A.w / w, sy = A.h / h;
      const alphaAt = (x, y) => A.a[Math.min(A.h - 1, Math.floor(y * sy)) * A.w + Math.min(A.w - 1, Math.floor(x * sx))];
      let tagAll = 0, nAll = 0;
      for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
        if (!M.mask[y * w + x]) continue; nAll++; if (alphaAt(x, y) >= 3.5) tagAll++;
      }
      const acc = { under: { n: 0, d: 0, l: 0, lr: 0, tag: 0, card: 0 }, over: { n: 0, d: 0, l: 0, lr: 0, tag: 0, card: 0 } };
      if (line && line.pts.length >= 2) {
        const px = line.pts.map((p) => p[0]), py = line.pts.map((p) => p[1]);
        const x0 = Math.max(0, Math.ceil(px[0])), x1 = Math.min(w - 1, Math.floor(px[px.length - 1]));
        let j = 0;
        for (let x = x0; x <= x1; x++) {
          while (j < px.length - 2 && px[j + 1] < x) j++;
          const t = (x - px[j]) / Math.max(1e-6, px[j + 1] - px[j]);
          const yl = Math.round(py[j] + (py[j + 1] - py[j]) * Math.min(1, Math.max(0, t)));
          for (const [key, a0, a1] of [['under', yl + 2, yl + 26], ['over', yl - 26, yl - 2]]) {
            for (let y = Math.max(0, a0); y < Math.min(h, a1); y++) {
              const i = y * w + x;
              if (!M.mask[i]) continue;
              const s = acc[key], al = alphaAt(x, y);
              s.n++; s.d += Lr.lum[i] - L.lum[i]; s.l += L.lum[i]; s.lr += Lr.lum[i];
              if (al >= 3.5) s.tag++; else if (al < 1.5) s.card++;
            }
          }
        }
      }
      const fin = (s) => s.n ? { pixels: s.n, darken: +(s.d / s.n).toFixed(2), ratio: +(s.l / Math.max(1e-6, s.lr)).toFixed(3),
        tag: +(s.tag / s.n).toFixed(3), untaggedUnlit: +(s.card / s.n).toFixed(3) } : { pixels: 0 };
      const under = fin(acc.under), over = fin(acc.over);
      return { tankPixels: nAll * 4, tagAll: nAll ? +(tagAll / nAll).toFixed(3) : null, under, over,
        step: under.pixels && over.pixels ? +(under.darken - over.darken).toFixed(2) : null, line: line?.shape ?? null };
    };
  });

  const shot = async (file) => { await page.evaluate(() => window.__GWB.frames(4)); await page.screenshot({ path: file }); };
  /** One view: the frame, the frame without the ground occlusion, the tank mask and the metrics. */
  const measureView = async (prefix, sign) => {
    await page.evaluate(() => window.__GWB.toggle({}));
    await page.evaluate(() => window.__GWB.frames(16));
    await sleep(400);
    await shot(`${prefix}.png`);
    await page.evaluate(() => window.__GWB.captureLum('base'));
    await page.evaluate(() => window.__GWB.toggle({ VEHICLE_GROUND_AO: 0 }));
    await page.evaluate(() => window.__GWB.frames(8));
    await shot(`${prefix}__no_vgao.png`);
    await page.evaluate(() => window.__GWB.captureLum('ref'));
    await page.evaluate(() => window.__GWB.toggle({}));
    await page.evaluate(() => window.__GWB.frames(4));
    const pixels = await page.evaluate(() => window.__GWB.tankMask());
    await page.evaluate(() => window.__GWB.frames(4));
    const m = await page.evaluate((sign) => window.__GWB.measure(sign, 'base', 'ref'), sign);
    return { ...m, maskPixels: pixels };
  };

  // ---- the Garages
  await page.evaluate(() => { window.__GWB.mode = 'garage'; });
  for (const garage of garages) {
    for (const tank of tanks) {
      if (overCap()) { log('hold cap reached before', garage, tank); report.stoppedAt = `${garage}:${tank}`; break; }
      const staged = await page.evaluate(async (garage, tank) => {
        const D = window.__DEBUG, P = window.__GWB;
        P.pose = null; P.skin = null;
        if (D.showroom.debugState?.().running === false) D.showroom.start?.();
        D.shotMode = false;
        D.garage.setSelectedGarageVariant(garage);
        D.selectGarageTank(tank);
        await D.stagePedestalTank(tank);
        return { ped: D.pedestalVisual?.specId ?? null };
      }, garage, tank);
      await page.waitForFunction((tank) => window.__DEBUG.pedestalVisual?.specId === tank && window.__DEBUG.pedestalOnStage, { timeout: 90_000 }, tank)
        .catch(() => log('WARN pedestal not confirmed', garage, tank));
      staged.variant = await page.evaluate(() => window.__DEBUG.garage.getSelectedGarageVariant?.() ?? null);
      if (staged.variant !== garage) log('WARN garage variant not selected', garage, staged.variant);
      // the Garage's scene pack activates asynchronously (garageEnvironmentPresentation.activate): a longer settle on a switch
      await sleep(tank === tanks[0] ? 12_000 : 6000);
      const state = await page.evaluate(() => {
        const D = window.__DEBUG, P = window.__GWB;
        D.showroom.stop(); D.shotMode = true; P.hideUi(true);
        return { dormantSkin: P.energy.hasGarageTankEnergyVisual(P.root()) };
      });
      log('staged', garage, tank, JSON.stringify({ ...staged, ...state }));
      for (const view of viewNames) {
        const o = VIEWS[view];
        if (!o) throw new Error(`unknown view ${view}`);
        const posed = await page.evaluate((o) => window.__GWB.poseSide(1, o), o);
        const prefix = `${out}/garage_${garage}_${tank}_${view}`;
        const m = await measureView(prefix, 1);
        const row = { garage, tank, view, ...staged, ...state, posed, ...m };
        report.garage.push(row);
        log('measured', garage, tank, view, `step=${m.step}`, `tagUnder=${m.under?.tag}`, `tagAll=${m.tagAll}`,
          `ratio u/o=${m.under?.ratio}/${m.over?.ratio}`);
        if (gate && (m.step === null || m.step >= maxStep || (m.under?.tag ?? 0) < minTag)) failed.push(`${garage}:${tank}:${view}`);
      }
      await page.evaluate(() => window.__GWB.hideUi(false));
    }
    if (report.stoppedAt) break;
  }

  // ---- a daylight battle view of the player tank, plain and wearing the live energy skin
  if (flag('battle') && !overCap()) {
    await page.evaluate(async (tank) => {
      const D = window.__DEBUG, P = window.__GWB;
      P.pose = null; P.skin = null; P.mode = 'shot';
      D.selectGarageTank(tank);
    }, battleTank);
    await sleep(1500);
    const info = await page.evaluate(async () => {
      await window.__SHOTS.set('player_view');
      const D = window.__DEBUG, P = window.__GWB;
      P.dims = D.game.player?.spec?.dims ?? null;
      return { map: D.world?.config?.id ?? D.game.mapId ?? null, player: D.game.player?.spec?.id ?? null, sunY: D.scene.userData.sunDirWorld?.y ?? null };
    });
    log('battle', JSON.stringify(info));
    await sleep(5000);
    await page.evaluate(() => { const P = window.__GWB; P.mode = 'battle'; P.hideUi(true); });
    for (const skin of ['none', 'live']) {
      await page.evaluate((skin) => { window.__GWB.skin = skin === 'live' ? 'live' : null; }, skin);
      for (const view of viewNames) {
        // the battle pose reads the ground-AO hull record, measured once the hull has drawn near the camera
        await page.evaluate((o) => window.__GWB.poseSide(1, o), VIEWS[view]);
        await page.evaluate(() => window.__GWB.frames(12));
        const posed = await page.evaluate((o) => window.__GWB.poseSide(1, o), VIEWS[view]);
        await page.evaluate(() => window.__GWB.frames(30));
        await sleep(1500);
        const prefix = `${out}/battle_${info.map}_${info.player}_${skin}_${view}`;
        const m = await measureView(prefix, 1);
        report.battle.push({ ...info, skin, view, posed, ...m });
        log('battle measured', skin, view, `step=${m.step}`, `tagUnder=${m.under?.tag}`, `tagAll=${m.tagAll}`);
      }
      if (skin === 'live') await page.evaluate(() => { const P = window.__GWB; P.skin = null; P.energy.clearJuggernautVisual(P.root()); });
    }
  }
  report.heldS = Math.round((Date.now() - heldAt) / 1000);
} finally {
  writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 1));
  await browser?.close().catch(() => {});
  await server?.close().catch(() => {});
  if (heartbeat) clearInterval(heartbeat);
  if (!lockHeld) lock.release();
  log('done', out);
}
if (failed.length) {
  console.error(`garage-wheel-band: FAIL ${failed.length} view(s) over the gate (step >= ${maxStep} or tag under < ${minTag}): ${failed.join(', ')}`);
  process.exit(1);
}
if (report.errors.length) log(`${report.errors.length} page error(s) recorded in report.json`);
console.log(`garage-wheel-band: ${report.garage.length} Garage view(s), ${report.battle.length} battle view(s)${gate ? ' PASS' : ''}`);
