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
  // costland r4 (2026-10-10, the owner's case: a low side view of the hull on grass, sun fairly high): the eye 0.7 m
  // over the ground 6.5 m off the right side, looking at the lower hull and the track's foot
  lowside: { right: 6.5, fwd: 0.3, up: 0.7, atRight: 0.6, atFwd: 0.3, atUp: 0.35, fov: 45 },
  // the same side, a close crop of the wheel bay (the critics' 'gaps between the road wheels')
  bay: { right: 3.2, fwd: 0.4, up: 0.55, atRight: 1.2, atFwd: 0.4, atUp: 0.3, fov: 40 },
  // the owner's frame as described (a low side view, the hull on grass, the frame along its side): closer and lower
  owner: { right: 5.0, fwd: -0.4, up: 0.45, atRight: 0.4, atFwd: 0.2, atUp: 0.55, fov: 50 },
  // r4 (2026-10-10, the owner's ORIGINAL screenshot, recovered): an elevated rear-quarter chase view looking down ~27° at the
  // ground under and beside the rear of the hull and the right track; a steeper one; and the chase camera straight behind
  rearq: { right: 4.0, fwd: -7.0, up: 3.0, atRight: 1.3, atFwd: -2.5, atUp: 0.3, fov: 50 },
  rearqhi: { right: 3.6, fwd: -6.0, up: 4.2, atRight: 1.3, atFwd: -2.3, atUp: 0.2, fov: 50 },
  chase: { right: 0.0, fwd: -9.0, up: 3.6, atRight: 0.0, atFwd: -1.5, atUp: 0.6, fov: 55 },
  // the owner's screenshot framed: beside the right track just behind the rear corner, ~23° down, close — the last road
  // wheels, the run's rear end and the ground under the hull's rear overhang (ownerq2: the same, tighter)
  ownerq: { right: 4.0, fwd: -5.0, up: 1.6, atRight: 1.4, atFwd: -3.0, atUp: 0.2, fov: 45 },
  ownerq2: { right: 3.4, fwd: -4.6, up: 1.4, atRight: 1.5, atFwd: -3.1, atUp: 0.2, fov: 34 },
};
function pageHullPose(v, stampPress = true) {
  const D = window.__DEBUG, V = D.camera.position.constructor, p = D.game.player;
  const s = p.state, yaw = s.yaw;
  // r4 (2026-10-10): the shots harness never steps the sward's press field (pressureSteps 0), so a parked hull stood in
  // unpressed grass; live play presses it (main.ts publishes every hull's footprint). Stamp the player's footprint as play
  // does — the same on every build — and step the field before the frame.
  let pressInfo = null;
  if (stampPress && D.world?.setGroundDisturbances) pressInfo = window.__labStampPress?.(false) ?? null;
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
  const sd = D.scene.userData.sunDirWorld;
  const sun = sd ? [sd.x, sd.y, sd.z] : null;
  // r4: the sward's press state (main.ts publishes the hulls' footprints; round 4 also while paused) and the light model
  let press = null;
  try { const tg = D.world?._tallGrass?.getState?.(); press = { paused: D.pauseInfo?.paused ?? null, pressure: tg?.pressure ?? null, steps: tg?.pressureSteps ?? null }; } catch { /* absent */ }
  const lm = D.scene.userData.lightModel;
  const light = lm ? { mode: lm.mode, groundAlbedo: lm.groundAlbedo ?? null } : null;
  // r4: the player's measured ground solid (vehicleGroundOcclusion.ts) and its root's world matrix, to project the slab's
  // edges for the hardness/darkness profiles
  let ground = null;
  try {
    const near = D.scene.userData.nearVehicles ?? [];
    let best = null, bd = Infinity;
    for (const e of near) {
      const r = e?.root; if (!r) continue;
      const d = Math.hypot(r.position.x - s.pos.x, r.position.z - s.pos.z);
      if (d < bd) { bd = d; best = r; }
    }
    if (best && bd < 2) {
      best.updateMatrixWorld(true);
      ground = { shape: best.userData.groundAoShape ?? null, matrix: Array.from(best.matrixWorld.elements) };
    }
  } catch { /* absent */ }
  D.camera.updateMatrixWorld(true);
  const proj = { fov: v.fov, width: window.innerWidth, height: window.innerHeight,
    camMatrix: Array.from(D.camera.matrixWorld.elements), projMatrix: Array.from(D.camera.projectionMatrix.elements) };
  return { cam, at, hull: [pos.x, pos.y, pos.z, yaw], spec: p.specId, sun, press, pressInfo, light, ground, proj,
    sunElevDeg: sd ? Math.asin(Math.max(-1, Math.min(1, sd.y / Math.hypot(sd.x, sd.y, sd.z)))) * 180 / Math.PI : null };
}
function pageInstallPressHelper() {
  // (2026-10-11 round 6) the player's grass press as play stamps it: main.ts from round 6 stamps the hull's whole footprint
  // (dims.hullLengthM × widthM, at least the contact); window.__labPressOld = true stamps the old contact rect instead
  window.__labStampPress = (clear) => {
    const D = window.__DEBUG, p = D.game.player, s = p.state, yaw = s.yaw;
    const cg = p.contactGeom ?? {}, dims = p.spec?.dims ?? {};
    const old = !!window.__labPressOld;
    const hl = old ? cg.halfLenM : Math.max(cg.halfLenM ?? 0, (dims.hullLengthM ?? 0) * 0.5);
    const hw = old ? cg.halfWidM : Math.max(cg.halfWidM ?? 0, (dims.widthM ?? 0) * 0.5);
    const tg = D.world?._tallGrass;
    if (clear) { try { tg?.pressure?.clear(); tg?.pressureFine?.clear(); } catch { /* absent */ } }
    D.world.setGroundDisturbances([{ x: s.pos.x, z: s.pos.z, dirX: Math.sin(yaw), dirZ: Math.cos(yaw), speed: 0,
      halfLength: typeof hl === 'number' && hl > 0 ? hl : undefined, halfWidth: typeof hw === 'number' && hw > 0 ? hw : undefined }]);
    // (15:20) step the two fields directly: world.update(dt) also advanced the grass's wind clock (0.3 s a stamp), so every
    // blade swayed between variants and the press / soil A/Bs compared different wind phases
    for (let i = 0; i < 6; i++) { tg?.pressure?.step(0.05, s.pos.x, s.pos.z); tg?.pressureFine?.step(0.05, s.pos.x, s.pos.z); }
    return { stamped: true, old, halfLength: hl ?? null, halfWidth: hw ?? null };
  };
  return true;
}
function pageContactVariant(name) {
  // costland (2026-10-09): the dark-rectangle hunt — full; noao (the vehicles' ground occlusion off); nosscs (the
  // screen-space contact shadows off); nobatch (the articulated running-gear shadow batches hidden); none (ao + sscs off)
  const D = window.__DEBUG;
  // r4: nocav = the vehicle cavity term AND the ground occlusion off (both ride lightFx.vehicleOcclusion);
  // noall = those and the screen-space contact shadows off
  // r4 levers (vehicleGroundOcclusion.ts round 4; ignored by builds without them): r3eq = every round-4 term off on the
  // round-4 build (the round-3 look on one frame); nocore / noband / noberm / nogrime / nosoft / noguard = one term off
  // (2026-10-11 13:10) no GROUND_AO_WALL_SOFT by default: forcing 0.7 overrode the build's own value (1 on snow since
  // a5a058101), so every winter 'full'/'r4eq' frame softened the broad share beside the hull as the build never does
  const r4 = { GROUND_AO_CORE: 1, GROUND_AO_BAND: 1, GROUND_AO_BERM: 1, GROUND_AO_GRIME: 1, GROUND_AO_NORMAL_GUARD: 1 };
  if (name === 'r3eq') Object.assign(r4, { GROUND_AO_CORE: 0, GROUND_AO_BAND: 0, GROUND_AO_BERM: 0, GROUND_AO_GRIME: 0, GROUND_AO_NORMAL_GUARD: 0 });
  if (name === 'nocore') r4.GROUND_AO_CORE = 0;
  if (name === 'noband') r4.GROUND_AO_BAND = 0;
  if (name === 'noberm') r4.GROUND_AO_BERM = 0;
  if (name === 'nogrime') r4.GROUND_AO_GRIME = 0;
  if (name === 'nosoft' || name === 'r3eq') r4.GROUND_AO_WALL_SOFT = 1;
  if (name === 'noguard') r4.GROUND_AO_NORMAL_GUARD = 0;
  // the joint cap's lever (round 4 builds from 2026-10-10 14:00): capNN = GROUND_AO_OCC_CAP 0.NN; r3eq = round 3's 0.55; any
  // other variant leaves the build's own cap (the key removed — 14:27: forcing 0.55 on 'full' hid the shipped 0.35)
  const capM = /^cap(\d\d)$/.exec(name);
  const tune = { ...(window.__LIGHT_TUNE || {}), ...r4, VEHICLE_GROUND_AO: name === 'noao' || name === 'none' ? 0 : 1 };
  if (!('GROUND_AO_WALL_SOFT' in r4)) delete tune.GROUND_AO_WALL_SOFT;
  if (capM) tune.GROUND_AO_OCC_CAP = Number(capM[1]) / 100;
  else if (name === 'r3eq') tune.GROUND_AO_OCC_CAP = 0.55;
  else delete tune.GROUND_AO_OCC_CAP;
  // round 5 levers (2026-10-11; ignored by older builds): r4eq = every round-5 term off on a round-5 build (the old shoe skip,
  // no gear cap, no contact blend, no snow cast, round 4's snow cap 0.65, the fine press field off); shoeskip / nogear /
  // noblend / nocool / nofine = one term off
  const mapId = D.world?.mapId ?? '';
  // (r3eq on a round-5 build is round 3 on the same frame: the round-4 terms above off, the joint cap 0.55 everywhere, and the
  // round-5 terms off too — the before of a wave whose after lands r4 + r5 against production's round 3)
  const r5off = name === 'r4eq' || name === 'r3eq';
  tune.GROUND_AO_SHOE_SKIP = r5off || name === 'shoeskip' ? 1 : 0;
  tune.GROUND_AO_GEAR_CAP = r5off || name === 'nogear' ? 0 : 0.75;
  tune.GROUND_AO_BLEND = r5off || name === 'noblend' ? 0 : 1;
  tune.GROUND_AO_COOL = r5off || name === 'nocool' ? 0 : 1;
  if (name === 'r4eq' && mapId === 'winter') tune.GROUND_AO_OCC_CAP = 0.65;
  // round 6 levers (2026-10-11): r5eq = the round-6 terms off (no soil band, no snow recesses, the old press law and stamp);
  // r3eq/r4eq imply it; nosoil / norecess / oldpress = one term off. (The berm's new 6 cm × 32 cm geometry has no lever: r3eq
  // turns the berm off altogether, r4eq/r5eq show the new one.)
  const r6off = r5off || name === 'r5eq';
  tune.GROUND_AO_SOIL = r6off || name === 'nosoil' ? 0 : 1;
  // (round 6.1, 2026-10-11 16:50) the snow foot's law: 0 = round 5's line and no crest; oldfoot = that term off (norecess, its
  // round-6 name, kept as an alias); the round-6 build reads the old lever name GROUND_AO_RECESS (set both)
  tune.GROUND_AO_SNOW_FOOT = r6off || name === 'oldfoot' || name === 'norecess' ? 0 : 1;
  tune.GROUND_AO_RECESS = tune.GROUND_AO_SNOW_FOOT;
  const oldPress = r6off || name === 'oldpress';
  tune.GROUND_PRESS_EDGE = oldPress ? -0.15 : 0.12;
  tune.GROUND_PRESS_FEATHER = oldPress ? 0.45 : 0.6;
  if (name === 'r5eq') { tune.GROUND_AO_SHOE_SKIP = 0; tune.GROUND_AO_GEAR_CAP = 0.75; tune.GROUND_AO_BLEND = 1; tune.GROUND_AO_COOL = 1; }
  window.__LIGHT_TUNE = tune;
  // the press under this variant's law and stamp: cleared and stamped again (a press only ever rises)
  if (window.__labStampPress && window.__labPressOld !== oldPress) { window.__labPressOld = oldPress; window.__labStampPress(true); }
  const fine = D.world?._tallGrass?.pressureFine;
  if (fine?.params) fine.params.w = r5off || name === 'nofine' ? 0 : (fine.steps > 0 ? 1 : 0);
  D.post.setLightFx(name === 'nosscs' || name === 'none' ? { contactShadows: false }
    : name === 'nocav' ? { vehicleOcclusion: false }
    : name === 'noall' ? { vehicleOcclusion: false, contactShadows: false } : null);
  let batches = 0;
  D.scene.traverse((o) => {
    if (o.name !== 'articulatedShadowBatch') return;
    if (o.userData.labVisible === undefined) o.userData.labVisible = o.visible;
    o.visible = name === 'nobatch' ? false : o.userData.labVisible;
    batches++;
  });
  return { name, batches };
}

// costland lab3 (2026-10-09, the owner's "super super dark rectangular shadows under tracks"): per dist, per spec (its own
// boot: the pinned roster led by the spec, every map's camo forced to --camo), per map and hull view, the variants
//   node contact-lab3.mjs --dists=a:<dir>,b:<dir> --specs=m1a2,spz_puma --camo=desert --maps=verdant,desert
//        --views=side,low,rear --variants=a:full+noao+nosscs+nobatch,b:full --out=<dir> [--port=5660]
const dists3 = (arg('dists', '') || '').split(',').filter(Boolean).map((pair) => { const k = pair.indexOf(':'); return { name: pair.slice(0, k), dir: pair.slice(k + 1) }; });
const specs3 = arg('specs', 'm1a2').split(',');
const camo3 = arg('camo', null);
const variantsByDist = Object.fromEntries((arg('variants', '') || '').split(',').filter((p) => p.includes(':')).map((p) => [p.slice(0, p.indexOf(':')), p.slice(p.indexOf(':') + 1).split('+')]));
function pinnedFor(spec) {
  const roster = [spec, ...PINNED_SCENE.roster.filter((id) => id !== spec)].slice(0, PINNED_SCENE.roster.length);
  const pools = camo3 ? Object.fromEntries(Object.keys(PINNED_SCENE.camo.pools).map((k) => [k, [camo3]])) : PINNED_SCENE.camo.pools;
  return { ...PINNED_SCENE, playerSpecId: spec, roster, camo: { ...PINNED_SCENE.camo, pools } };
}
async function bootPage3(browser, baseUrl, pinned) {
  const page = await browser.newPage();
  const errors = [];
  await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((spec) => {
    try {
      localStorage.setItem(spec.storageKey, spec.playerSpecId);
      localStorage.setItem('cot.gfxPreset', 'high');
      localStorage.setItem('cot.battle.times.v2', JSON.stringify(['day']));
    } catch { /* storage blocked */ }
  }, pinned);
  page.on('pageerror', (error) => errors.push(String(error?.message ?? error).slice(0, 300)));
  await page.goto(`${baseUrl}/?nosplash=1&tier=desktop`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction('window.__GAME_READY === true && !!window.__SHOTS && !!window.__DEBUG', { timeout: 600000, polling: 500 });
  await page.evaluate(configurePinnedScene, pinned);
  return { page, errors };
}
async function main() {
  mkdirSync(out, { recursive: true });
  const record = { tool: 'contact-lab4', root, dists: dists3, specs: specs3, camo: camo3, frames: [], started: new Date().toISOString() };
  const save = () => writeFileSync(path.join(out, 'lab4.json'), JSON.stringify(record, null, 1));
  for (const dist of dists3) {
    const variants3 = variantsByDist[dist.name] ?? ['full'];
    const server = await startServer(dist.dir);
    try {
      for (const spec of specs3) {
        const browser = await puppeteer.launch({ headless: true, args: [...MAP_PROBE_BROWSER_ARGS, '--window-size=1600,900'], protocolTimeout: 900000 });
        try {
          const pinned = pinnedFor(spec);
          const { page, errors } = await bootPage3(browser, `http://127.0.0.1:${server.port}`, pinned);
          await page.evaluate(pageInstallPressHelper);
          const shotViews = await page.evaluate(() => [...window.__SHOTS.views]);
          for (const mapId of maps) {
            log(`${dist.name} ${spec} stage ${mapId}`);
            await stageMap(page, mapId, shotViews);
            if (freeze) await freezeLib.installCloudFreeze(page);
            // r4 (2026-10-10): --time=day|sunset|night re-keys the battle atmosphere (the Studio's own path) before the views
            const timeOpt = arg('time', null);
            if (timeOpt) {
              await within(page.evaluate((m, t) => window.__DEBUG.battleAtmosphere.prepare(0, m, [t]), mapId, timeOpt), 300000, `prepare ${timeOpt}`);
              await page.evaluate(pageFrames, 4);
              if (freeze) await freezeLib.installCloudFreeze(page);
            }
            for (const viewName of viewNames) {
              const v = HULL_VIEWS[viewName];
              const pose = await page.evaluate(pageHullPose, v, arg('press', '1') === '1');
              await settleView(page);
              for (const variant of variants3) {
                const switched = await page.evaluate(pageContactVariant, variant);
                await page.evaluate(pageFrames, 6);
                const file = path.join(dist.name, spec, mapId, `${viewName}-${variant}.png`);
                mkdirSync(path.join(out, dist.name, spec, mapId), { recursive: true });
                await within(page.screenshot({ path: path.join(out, file), type: 'png' }), 120000, 'screenshot');
                record.frames.push({ dist: dist.name, spec, mapId, view: viewName, variant, file, pose, switched });
              }
              await page.evaluate(pageContactVariant, 'full');
              log(`${dist.name} ${spec} ${mapId} ${viewName} ${pose.spec}`);
              save();
            }
          }
          record.errors = [...(record.errors || []), ...errors.slice(0, 10)];
        } finally {
          await browser.close().catch(() => {});
        }
      }
    } finally {
      await server.close();
    }
  }
  record.ended = new Date().toISOString();
  save();
}
main().then(() => { log('done'); process.exit(0); }, (error) => { console.error(error); process.exit(1); });
