#!/usr/bin/env node
// nightsky lane lab (2026-10-08): the same view of a map at day, sunset and night, with layer masks, for the far-horizon
// lighting root cause. Copy into <root>/.qa-dev/ and run from the root:
//
//   node .qa-dev/tod-lab.mjs --out=<dir> --maps=alpine,desert --times=day,sunset,night
//        [--views=sun,anti,sun-up] [--variants=full,nopano] [--port=5640] [--settle-ms=900] [--freeze=1]
//
// Serves <root>/dist through vite preview, boots one headless Chrome at 1600 x 900 (High, desktop tier), stages each map
// through __SHOTS.set (the census' cloudscape gate and texture settle), applies the time of day through the battle
// atmosphere (window.__DEBUG.battleAtmosphere.prepare(0, map, [time]) — the Studio's own path), poses each view (an eye
// 2.5 m over the ground 80 m inside the edge, looking level out toward the sun azimuth or away from it; '-up' views
// 60 m up, pitched 8 degrees down), settles (terrain, grass, impostors and the panorama bake, clouds), and screenshots
// the frame and its variants (nopano: the far panorama shell hidden). Writes <out>/<map>/<time>-<view>[-variant].png
// and <out>/lab.json with each frame's light state.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer, preview } from 'vite';
import puppeteer from 'puppeteer';

const root = process.cwd();
const arg = (name, fallback = null) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const out = path.resolve(arg('out', ''));
if (!arg('out')) throw new Error('--out=<dir> is required');
const maps = arg('maps', 'alpine').split(',');
const times = arg('times', 'day,sunset,night').split(',');
const viewNames = arg('views', 'sun,anti').split(',');
const variants = arg('variants', 'full,nopano').split(',');
const port0 = Number(arg('port', '5640'));
const settleMs = Number(arg('settle-ms', '900'));
const freeze = arg('freeze', '1') === '1';
const serve = arg('serve', 'dist');
// plan mode (the gauntlet's frames): --plan=<json [{id, map, time, cam:[x,y,z], at:[x,y,z], fov}]> --dists=a:<dir>,b:<dir>;
// absolute poses (world metres), each dist served in turn from the same tools, frames to <out>/<dist>/<id>.png
const planFile = arg('plan', null);
const dists = (arg('dists', '') || '').split(',').filter(Boolean).map((pair) => { const i = pair.indexOf(':'); return { name: pair.slice(0, i), dir: pair.slice(i + 1) }; });
const SP = '/private/tmp/claude-501/-Users-kevinliu--codex-worktrees-cot-restore-1049-visuals-20260911/6412983f-6279-4f04-92ea-e3d886747505/scratchpad';

const tool = (p) => import(pathToFileURL(path.join(root, 'tools', p)).href);
const { MAP_PROBE_BROWSER_ARGS, mapProbeServerOptions } = await tool('map-probe-runtime.mjs');
const { settleMapTextures } = await tool('map-environment-acquisition.mjs');
const { settleResidencyTerrain } = await tool('world-residency-acquisition.mjs');
const { PINNED_SCENE, configurePinnedScene } = await tool('pinned-scene-acquisition.mjs');
const { censusShotView, censusWarmupMap, cloudscapeVerdict, CLOUDSCAPE_WAIT_MS } = await tool('visual-census.mjs');
const freezeLib = await import(pathToFileURL(path.join(SP, 'fifo2/lib/cloud-freeze.mjs')).href);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = () => new Date().toTimeString().slice(0, 8);
const log = (...a) => console.log(`[tod-lab] ${stamp()}`, ...a);
async function within(promise, ms, label) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} exceeded ${Math.round(ms / 1000)} s`)), ms); })]);
  } finally { clearTimeout(timer); }
}

const VIEWS_UNUSED = {
  sun: { heading: 'sun', inset: 80, eye: 2.5, pitchDeg: 0 },
  anti: { heading: 'anti', inset: 80, eye: 2.5, pitchDeg: 0 },
  side: { heading: 'side', inset: 80, eye: 2.5, pitchDeg: 0 },
  'sun-up': { heading: 'sun', inset: 80, eye: 60, pitchDeg: -8 },
  'anti-up': { heading: 'anti', inset: 80, eye: 60, pitchDeg: -8 },
  // a raised eye (a crest, a tower), nearly level: the far country over the ring on the maps whose ring hides it at
  // tank height
  'sun-hi': { heading: 'sun', inset: 80, eye: 30, pitchDeg: -2 },
  'anti-hi': { heading: 'anti', inset: 80, eye: 30, pitchDeg: -2 },
  'side-hi': { heading: 'side', inset: 80, eye: 30, pitchDeg: -2 },
};

// ------------------------------------------------------------------------------------------------ page functions

function pageCloudscapeState() {
  const D = window.__DEBUG, config = D.world?.config ?? {}, vc = D.scene.userData.volumetricClouds;
  return { mapId: D.world?.mapId ?? null, layer: !!vc, authored: config.clouds?.regime ?? config.sky?.cloudscape?.regime ?? null,
    regime: vc?.currentPreset?.regime ?? null };
}
function pageGrassReady() {
  const D = window.__DEBUG, V = D.camera.position.constructor;
  D.world.update(0, D.camera.position, D.camera.getWorldDirection(new V()), null);
  const s = D.world.getGrassWorkState();
  return s.pendingVisible === 0 && !s.carpet.pending;
}
function pageFrames(count) {
  return new Promise((resolve) => {
    let left = count;
    const tick = () => (--left <= 0 ? resolve(true) : requestAnimationFrame(tick));
    requestAnimationFrame(tick);
  });
}
function pagePose(spec) {
  const D = window.__DEBUG, hf = D.world.heightField, V = D.camera.position.constructor;
  const clamp = (v) => Math.max(-511, Math.min(511, v));
  const sky = D.world.config?.sky ?? {};
  const az = (sky.sunAzimuthDeg ?? 115) * Math.PI / 180;
  let hx = Math.sin(az), hz = Math.cos(az);
  if (spec.heading === 'anti') { hx = -hx; hz = -hz; }
  if (spec.heading === 'side') { const t = hx; hx = -hz; hz = t; }
  const t = (512 - spec.inset) / Math.max(Math.abs(hx), Math.abs(hz));
  const sx = hx * t, sz = hz * t;
  const ground = hf.getHeightAt(clamp(sx), clamp(sz));
  const depth = hf.getWaterDepthAt?.(clamp(sx), clamp(sz)) ?? 0;
  const cam = [sx, ground + Math.max(0, depth) + spec.eye, sz];
  const p = spec.pitchDeg * Math.PI / 180;
  const at = [cam[0] + hx * 400 * Math.cos(p), cam[1] + 400 * Math.sin(p), cam[2] + hz * 400 * Math.cos(p)];
  D.rig.setExternalPose(new V(...cam), new V(...at), 55);
  const vc = D.scene.userData.volumetricClouds;
  if (vc) {
    for (const key of ['weatherShift', 'noiseShift', 'cirrusShift']) {
      const v = vc[key];
      if (v && typeof v.set === 'function') { if (v.isVector3) v.set(0, 0, 0); else v.set(0, 0); }
    }
    if (typeof vc.resetHistory === 'function') vc.resetHistory();
  }
  D.world.update(0, D.camera.position, D.camera.getWorldDirection(new V()), null);
  D.lighting.updateFrustums();
  D.lighting.update(true);
  return { cam, at, heading: [hx, hz], sunAzDeg: sky.sunAzimuthDeg ?? 115 };
}
function pageAbsolutePose(view) {
  const D = window.__DEBUG, V = D.camera.position.constructor;
  D.rig.setExternalPose(new V(...view.cam), new V(...view.at), view.fov ?? 55);
  const vc = D.scene.userData.volumetricClouds;
  if (vc) {
    for (const key of ['weatherShift', 'noiseShift', 'cirrusShift']) {
      const v = vc[key];
      if (v && typeof v.set === 'function') { if (v.isVector3) v.set(0, 0, 0); else v.set(0, 0); }
    }
    if (typeof vc.resetHistory === 'function') vc.resetHistory();
  }
  D.world.update(0, D.camera.position, D.camera.getWorldDirection(new V()), null);
  D.lighting.updateFrustums();
  D.lighting.update(true);
  return { cam: D.camera.position.toArray(), fov: D.camera.fov };
}
function pageSettleClouds() {
  const D = window.__DEBUG, vc = D.scene.userData.volumetricClouds;
  if (!vc) return { present: false };
  return { present: true, ran: vc.settleForCapture(D.camera), remaining: vc.captureFramesRemaining };
}
function pageCloudsReady() {
  const vc = window.__DEBUG.scene.userData.volumetricClouds;
  return !vc || vc.captureFramesRemaining === 0;
}
function pagePanorama() {
  const D = window.__DEBUG;
  const ring = D.world?.group?.getObjectByName('horizon-ring');
  const h = ring?.userData?.horizonPanorama;
  if (!h) return null;
  return { baked: h.baked, visible: h.mesh.visible, color: h.mesh.material.color.toArray(), stats: JSON.parse(JSON.stringify(h.stats)) };
}
function pageMarkPanorama(on) {
  const D = window.__DEBUG;
  const ring = D.world?.group?.getObjectByName('horizon-ring');
  const h = ring?.userData?.horizonPanorama;
  if (!h) return null;
  const c = h.mesh.material.color;
  if (on) { h.mesh.userData.__labColor = c.toArray(); c.setRGB(0, 0, 0); }
  else if (h.mesh.userData.__labColor) { c.fromArray(h.mesh.userData.__labColor); delete h.mesh.userData.__labColor; }
  return c.toArray();
}
function pageSetPanoramaVisible(on) {
  const D = window.__DEBUG;
  const ring = D.world?.group?.getObjectByName('horizon-ring');
  const h = ring?.userData?.horizonPanorama;
  if (!h) return false;
  h.mesh.visible = !!on && h.baked;
  return true;
}
function pageLightState() {
  const D = window.__DEBUG, s = D.scene.userData, m = s.lightModel ?? null, a = s.atmosphere ?? null;
  const weather = D.battleAtmosphere?.current?.weather ?? null;
  const r4 = (v) => (typeof v === 'number' ? Math.round(v * 1e4) / 1e4 : v);
  const arr = (v) => (Array.isArray(v) ? v.map(r4) : v && typeof v.toArray === 'function' ? v.toArray().map(r4) : null);
  const csm = D.lighting.csm, sun = csm?.lights?.[0];
  return {
    timeOfDay: weather?.timeOfDay ?? 'authored',
    model: m ? { mode: m.mode, sunIntensity: r4(m.sunIntensity), sunColor: arr(m.sunColor), envIntensity: r4(m.envIntensity),
      envDiffuseGain: r4(m.envDiffuseGain), hemiIntensity: r4(m.hemiIntensity), hemiSky: arr(m.hemiSky), illuminance: r4(m.illuminance),
      exposure: r4(m.exposure), night: r4(m.night), overcast: r4(m.overcast) } : null,
    atmosphere: a ? { active: a.active, skyIntensity: r4(a.skyIntensity), sunDir: a.sunDir ? [a.sunDir.x, a.sunDir.y, a.sunDir.z].map(r4) : null,
      fogTint: arr(a.fogTint), fogMix: r4(a.fogMix), horizonLum: r4(a.horizonLum), irradianceRaw: arr(a.irradianceRaw),
      summaryHorizon: a.summary ? arr(a.summary.horizon) : null, summarySunHorizon: a.summary ? arr(a.summary.sunHorizon) : null } : null,
    csmSun: sun ? { intensity: r4(sun.intensity), color: sun.color.toArray().map(r4) } : null,
    fog: D.scene.fog ? { color: D.scene.fog.color.toArray().map(r4), density: D.scene.fog.density } : null,
    postExposure: s.postExposure ?? null,
    // the last frame's whole-frame counters (the census line: B's draws and triangles against A's)
    info: (() => { const f = D.post?.lastCompletedFrame; return f ? { calls: f.calls, triangles: f.triangles, serial: f.serial, programs: D.renderer.info.programs?.length ?? null } : null; })(),
  };
}

// ------------------------------------------------------------------------------------------------ run

async function startServer(distDir = null) {
  // (plan mode) `dev@<source root>`: that root's source through a dev server on its own private optimizer cache — no
  // build output on disk
  const devRoot = distDir && distDir.startsWith('dev@') ? path.resolve(distDir.slice(4)) : null;
  if (devRoot) distDir = null;
  if (distDir && !existsSync(path.join(distDir, 'index.html'))) throw new Error(`${distDir}/index.html missing`);
  if (!distDir && serve === 'dist' && !existsSync(path.join(root, 'dist', 'index.html'))) throw new Error(`${root}/dist/index.html missing`);
  for (let p = port0; p < port0 + 20; p++) {
    try {
      if (devRoot || (serve === 'dev' && !distDir)) {
        // a private optimizer cache (never the shared one: it hangs npm test), kept between lab runs
        const sourceRoot = devRoot ?? root;
        const cacheDir = path.join(SP, 'nightsky', `vite-cache-${path.basename(sourceRoot)}`);
        mkdirSync(cacheDir, { recursive: true });
        const options = mapProbeServerOptions(sourceRoot, cacheDir);
        const server = await createServer({ ...options, server: { ...options.server, port: p, strictPort: true } });
        await server.listen();
        return { port: p, close: () => server.close() };
      }
      // (a dist elsewhere is served through this root's own config — its route rewrites — with the outDir pointed at it)
      const server = await preview({ root, logLevel: 'error', ...(distDir ? { build: { outDir: distDir } } : {}),
        preview: { host: '127.0.0.1', port: p, strictPort: true } });
      return { port: p, close: () => server.close() };
    } catch (error) {
      if (/already in use|EADDRINUSE/i.test(String(error?.message || error) + (error?.code || ''))) continue;
      throw error;
    }
  }
  throw new Error('no free port');
}

async function bootPage(browser, baseUrl) {
  const page = await browser.newPage();
  const errors = [];
  await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((spec) => {
    try {
      localStorage.setItem(spec.storageKey, spec.playerSpecId);
      localStorage.setItem('cot.gfxPreset', 'high');
      localStorage.setItem('cot.battle.times.v2', JSON.stringify(['day']));
    } catch { /* storage blocked */ }
  }, PINNED_SCENE);
  page.on('pageerror', (error) => errors.push(String(error?.message ?? error).slice(0, 300)));
  page.on('console', (message) => {
    const text = message.text();
    if (message.type() === 'error' && !text.includes('favicon') && !text.startsWith('Failed to load resource')) errors.push(text.slice(0, 300));
  });
  await page.goto(`${baseUrl}/?nosplash=1&tier=desktop`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction('window.__GAME_READY === true && !!window.__SHOTS && !!window.__DEBUG', { timeout: 600000, polling: 500 });
  await page.evaluate(configurePinnedScene, PINNED_SCENE);
  return { page, errors };
}

async function awaitCloudscape(page) {
  const started = Date.now();
  let state = await page.evaluate(pageCloudscapeState), verdict = cloudscapeVerdict(state);
  while (verdict === 'legacy' && Date.now() - started < CLOUDSCAPE_WAIT_MS) {
    await sleep(250);
    state = await page.evaluate(pageCloudscapeState);
    verdict = cloudscapeVerdict(state);
  }
  return { ...state, verdict };
}

async function stageMap(page, mapId, shotViews) {
  const setShot = (id) => within(page.evaluate((name) => window.__SHOTS.set(name), censusShotView(id)), 600000, `__SHOTS.set(${id})`);
  await setShot(mapId);
  let cloudscape = await awaitCloudscape(page);
  if (cloudscape.verdict === 'legacy') {
    const warmup = censusWarmupMap(shotViews, mapId);
    log(`${mapId}: cloudscape legacy, warming up on ${warmup}`);
    await setShot(warmup);
    await setShot(mapId);
    cloudscape = await awaitCloudscape(page);
  }
  await page.evaluate(settleMapTextures, { mapId, timeoutMs: 180000 });
  await page.evaluate(() => window.__DEBUG.post.pinDynScale(1));
  return cloudscape;
}

async function settleView(page) {
  try { await page.evaluate(settleResidencyTerrain); } catch { /* optional */ }
  await page.waitForFunction(pageGrassReady, { timeout: 120000, polling: 'raf' });
  // the impostor warm (and the far panorama's bake, which rides it: map.ts warmImpostors)
  await page.evaluate(() => { try { return window.__DEBUG.world.warmImpostors?.() ?? null; } catch (e) { return String(e).slice(0, 120); } });
  await page.evaluate(pageFrames, 2);
  if (freeze) await freezeLib.settleCloudsFrozenOn(page);
  else await page.evaluate(pageSettleClouds);
  await page.waitForFunction(pageCloudsReady, { timeout: 120000, polling: 250 });
  await page.evaluate(pageFrames, 6);
  await sleep(settleMs);
}

async function runPlan() {
  const plan = JSON.parse(readFileSync(path.resolve(planFile), 'utf8'));
  mkdirSync(out, { recursive: true });
  const record = { plan: path.resolve(planFile), root, dists, shots: [], started: new Date().toISOString() };
  const save = () => writeFileSync(path.join(out, 'plan-run.json'), `${JSON.stringify(record, null, 1)}\n`);
  for (const dist of dists) {
    const server = await startServer(dist.dir);
    const browser = await puppeteer.launch({ headless: true, args: [...MAP_PROBE_BROWSER_ARGS, '--window-size=1600,900'], protocolTimeout: 900000 });
    try {
      const { page, errors } = await bootPage(browser, `http://127.0.0.1:${server.port}`);
      const shotViews = await page.evaluate(() => [...window.__SHOTS.views]);
      const byMap = new Map();
      for (const shot of plan) { if (!byMap.has(shot.map)) byMap.set(shot.map, []); byMap.get(shot.map).push(shot); }
      for (const [mapId, shots] of byMap) {
        log(`${dist.name}: stage ${mapId}`);
        const cloudscape = await stageMap(page, mapId, shotViews);
        await freezeLib.installCloudFreeze(page);
        // times in a fixed order per map: day, sunset, night (each prepare re-keys the sky; the relight runs inside it)
        for (const time of ['day', 'sunset', 'night']) {
          const timed = shots.filter((s2) => s2.time === time);
          if (!timed.length) continue;
          await within(page.evaluate((m, t) => window.__DEBUG.battleAtmosphere.prepare(0, m, [t]), mapId, time), 300000, `prepare ${time}`);
          await page.evaluate(pageFrames, 4);
          await freezeLib.installCloudFreeze(page);
          for (const shot of timed) {
            const posed = await page.evaluate(pageAbsolutePose, shot);
            await settleView(page);
            const light = await page.evaluate(pageLightState);
            const panorama = await page.evaluate(pagePanorama);
            mkdirSync(path.join(out, dist.name), { recursive: true });
            const file = path.join(dist.name, `${shot.id}.png`);
            await within(page.screenshot({ path: path.join(out, file), type: 'png' }), 120000, 'screenshot');
            record.shots.push({ dist: dist.name, id: shot.id, map: mapId, time, file, posed, light, panorama, cloudscape: cloudscape.verdict, at: new Date().toISOString() });
            save();
            log(`${dist.name} ${shot.id}: ${time} exposure ${light.model?.exposure} pano ${panorama ? `${panorama.stats?.bakes}/${panorama.stats?.relights}` : 'none'}`);
          }
        }
      }
      record.errors = { ...(record.errors ?? {}), [dist.name]: errors.slice(0, 40) };
      save();
    } finally {
      await browser.close().catch(() => {});
      await server.close();
    }
  }
  record.ended = new Date().toISOString();
  save();
}


// ------------------------------------------------------------------------------------------------ contact lab
// poses around the staged player hull: side (the track's flank at 1 m), low (ground level along the run), rear quarter
const HULL_VIEWS = {
  side: { right: 4.2, fwd: 0.6, up: 0.9, atRight: 1.4, atFwd: 0.6, atUp: 0.15, fov: 50 },
  low: { right: 3.0, fwd: 4.5, up: 0.35, atRight: 1.5, atFwd: -1.0, atUp: 0.1, fov: 50 },
  rear: { right: 3.6, fwd: -6.5, up: 2.2, atRight: 0.6, atFwd: -0.5, atUp: 0.3, fov: 50 },
};
function pageHullPose(v) {
  const D = window.__DEBUG, V = D.camera.position.constructor, p = D.game.player;
  const s = p.state, yaw = s.yaw;
  const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -fz, rz = fx; // hull forward (sin yaw, cos yaw); right = forward x up
  const pos = s.pos, hf = D.world.heightField;
  const g = (x, z) => hf.getHeightAt(Math.max(-511, Math.min(511, x)), Math.max(-511, Math.min(511, z)));
  const cx = pos.x + rx * v.right + fx * v.fwd, cz = pos.z + rz * v.right + fz * v.fwd;
  const ax = pos.x + rx * v.atRight + fx * v.atFwd, az = pos.z + rz * v.atRight + fz * v.atFwd;
  const cam = [cx, g(cx, cz) + v.up, cz], at = [ax, g(ax, az) + v.atUp, az];
  D.rig.setExternalPose(new V(...cam), new V(...at), v.fov);
  const vc = D.scene.userData.volumetricClouds;
  if (vc && typeof vc.resetHistory === 'function') vc.resetHistory();
  D.world.update(0, D.camera.position, D.camera.getWorldDirection(new V()), null);
  D.lighting.updateFrustums();
  D.lighting.update(true);
  return { cam, at, hull: [pos.x, pos.y, pos.z, yaw], spec: p.specId };
}
function pageContactVariant(name) {
  const D = window.__DEBUG;
  window.__LIGHT_TUNE = { ...(window.__LIGHT_TUNE || {}), VEHICLE_GROUND_AO: name === 'noao' || name === 'none' ? 0 : 1 };
  D.post.setLightFx(name === 'nosscs' || name === 'none' ? { contactShadows: false } : null);
  return name;
}
async function main() {
  mkdirSync(out, { recursive: true });
  const record = { root, frames: [] };
  const server = await startServer();
  const browser = await puppeteer.launch({ headless: true, args: [...MAP_PROBE_BROWSER_ARGS, '--window-size=1600,900'], protocolTimeout: 900000 });
  try {
    const { page, errors } = await bootPage(browser, `http://127.0.0.1:${server.port}`);
    const shotViews = await page.evaluate(() => [...window.__SHOTS.views]);
    for (const mapId of maps) {
      log(`stage ${mapId}`);
      await stageMap(page, mapId, shotViews);
      if (freeze) await freezeLib.installCloudFreeze(page);
      for (const viewName of viewNames) {
        const v = HULL_VIEWS[viewName];
        const pose = await page.evaluate(pageHullPose, v);
        await settleView(page);
        for (const variant of variants) {
          await page.evaluate(pageContactVariant, variant);
          await page.evaluate(pageFrames, 6);
          const file = path.join(mapId, `${viewName}-${variant}.png`);
          mkdirSync(path.join(out, mapId), { recursive: true });
          await within(page.screenshot({ path: path.join(out, file), type: 'png' }), 120000, 'screenshot');
          record.frames.push({ mapId, view: viewName, variant, file, pose });
        }
        await page.evaluate(pageContactVariant, 'full');
        log(`${mapId} ${viewName} ${JSON.stringify(pose.hull.map((x) => +x.toFixed(2)))} ${pose.spec}`);
      }
    }
    record.errors = errors.slice(0, 30);
    writeFileSync(path.join(out, 'contact.json'), JSON.stringify(record, null, 1));
  } finally {
    await browser.close().catch(() => {});
    await server.close();
  }
}
main().then(() => { log('done'); process.exit(0); }, (error) => { console.error(error); process.exit(1); });
