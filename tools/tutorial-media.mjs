#!/usr/bin/env node
// tutorial-media.mjs — the first-game tutorial's loops, staged and filmed in the Scene Studio (272).
// First-party tooling: Kevin B. Liu.
//
// Each loop is a short Studio scene (Verdant Fields, day), built here from its geometry, loaded through the production
// __STUDIO.load path and filmed with the deterministic film renderer (__STUDIO.exportFilm: exact frames, no drops), then
// re-encoded small (VP9 WebM, no audio) with a WebP poster from its middle frame. The files land in
// public/media/tutorial-r1/, which only the tutorial's card asks for (src/ui/tutorial/tutorialSteps.ts), never the boot.
//
//   node tools/tutorial-media.mjs --preview            framing stills per scene (to --out, default ../first-game-tutorial-272-evidence/media-preview)
//   node tools/tutorial-media.mjs --render             the loops and posters into public/media/tutorial-r1/
//   node tools/tutorial-media.mjs --render --only=angle
//
// Holds the shared capture lock (render class) for one short batch, and launches its browser through
// launchGuardedBrowser.
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import { launchGuardedBrowser } from './browser-launch.mjs';
import { openCaptureHold } from './capture-hold.mjs';
import { BOOT_LOADED_EXPRESSION } from './game-readiness.mjs';
import { nativeBrowserLaunchOptions } from './native-browser-launch.mjs';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const flag = (name) => process.argv.includes(`--${name}`);
const MODE = flag('render') ? 'render' : 'preview';
const ONLY = arg('only', null)?.split(',') ?? null;
const OUT_PREVIEW = resolve(arg('out', resolve(process.cwd(), '../first-game-tutorial-272-evidence/media-preview')));
const OUT_MEDIA = resolve(process.cwd(), 'public/media/tutorial-r1');
const WIDTH = 640, HEIGHT = 360, FPS = 30;
const MAP = 'verdant';

// --- the scenes -------------------------------------------------------------------------------------------------------
const rad = (deg) => (deg * Math.PI) / 180;
const ahead = ([x, z], deg, m) => [x + Math.sin(rad(deg)) * m, z + Math.cos(rad(deg)) * m];

// Verdant's spawn clearing (tools/studio-example-scenarios.mjs stageForMap: [130, 390] and [190, 390]) is open ground
// by construction (the world keeps its deployment clearings clear), so every scene stands on its middle. Every height
// below (camera shots, tracer ends, impact points) is above the ground under it: the page lifts each onto the terrain
// before the load (a storyboard shot's y is absolute world metres, and the clearing stands well above 0).
const BASE = [160, 390];
const vec = (deg) => [Math.sin(rad(deg)), Math.cos(rad(deg))];

/** Angle your armour: a hull turned 30° from the shooter; three shots glance off its front plate. */
function angleScene() {
  const at = [BASE[0], BASE[1]];
  const toShooter = 90; // the shooter stands off to +X
  const facing = toShooter - 30; // the front plate turned 30° away
  const n = vec(facing);
  const plate = ahead(at, facing, 3.4);
  const d = vec(toShooter + 180); // the shot's direction of travel
  const dot = d[0] * n[0] + d[1] * n[1];
  const out = [d[0] - 2 * dot * n[0], d[1] - 2 * dot * n[1]];
  const shooter = ahead(at, toShooter, 60);
  const effects = [300, 1500, 2700].flatMap((tMs, i) => {
    const to = [plate[0] + (i - 1) * 0.25, 1.7 + (i - 1) * 0.15, plate[1] + (i - 1) * 0.25];
    const from = [shooter[0], 2.4, shooter[1] + (i - 1) * 0.5];
    const away = [to[0] + out[0] * 40, to[1] + 6 + i * 2, to[2] + out[1] * 40];
    return [
      { id: `in${i}`, type: 'tracer', tMs, params: { from, to, shellType: 'AP', speedMps: 260, caliberMm: 105 } },
      { id: `hit${i}`, type: 'impact', at: to, tMs: tMs + 230, params: { kind: 'ricochet', caliberMm: 105, normal: [n[0], 0.15, n[1]] } },
      { id: `out${i}`, type: 'tracer', tMs: tMs + 240, params: { from: to, to: away, shellType: 'AP', speedMps: 220, caliberMm: 105 } },
    ];
  });
  // the camera stands off the shot line, to the side the ricochets leave toward, looking back at the plate
  const side = vec(toShooter - 90);
  const cam = [at[0] + side[0] * 12 + d[0] * -5, at[1] + side[1] * 12 + d[1] * -5];
  return {
    map: MAP, timeOfDay: 'day', seed: 2721, fx: { quality: 'cinematic', ambience: false },
    actors: [{ id: 'm1a1_abrams_hc', name: 'target', pos: at, facingDeg: facing, turretDeg: 30, gunDeg: 1, camo: 'auto', state: 'intact' }],
    effects,
    storyboard: { version: 1, durationMs: 4000, shots: [
      { id: 'cam', tMs: 0, pos: [cam[0], 3.2, cam[1]], lookAt: [plate[0], 1.3, plate[1]], fov: 46, rollDeg: 0, transition: 'smooth' },
      { id: 'cam2', tMs: 4000, pos: [cam[0] + 0.8, 3.0, cam[1] + 0.8], lookAt: [plate[0], 1.3, plate[1]], fov: 46, rollDeg: 0, transition: 'smooth' },
    ], actorTracks: [] },
  };
}

/** Flank the heavies: a heavy faces the front; a second tank drives round its side and puts a shot into it. */
function flankScene() {
  const heavy = [BASE[0] + 12, BASE[1]];
  const front = 90; // the heavy faces +X, toward the fight
  const startPos = [heavy[0] - 32, heavy[1] - 18];
  const endPos = [heavy[0] - 2, heavy[1] - 18]; // off the heavy's left side, 18 m out
  const fireMs = 3000;
  const muzzle = [endPos[0], 2.3, endPos[1] + 4.5];
  const sideHit = [heavy[0] - 0.5, 1.5, heavy[1] - 1.9];
  return {
    map: MAP, timeOfDay: 'day', seed: 2722, fx: { quality: 'cinematic', ambience: false },
    actors: [
      { id: 'jpz_e100', name: 'heavy', pos: heavy, facingDeg: front, turretDeg: 0, gunDeg: 1, camo: 'auto', state: 'intact' },
      { id: 'leo2_revolution', name: 'flanker', pos: startPos, facingDeg: 60, turretDeg: -40, gunDeg: 0, camo: 'auto', state: 'intact' },
    ],
    effects: [
      { id: 'flash', type: 'muzzle_flash', actor: 'flanker', tMs: fireMs, params: { caliberMm: 120 } },
      { id: 'shot', type: 'tracer', tMs: fireMs, params: { from: muzzle, to: sideHit, shellType: 'APFSDS', speedMps: 300, caliberMm: 120 } },
      { id: 'pen', type: 'impact', at: sideHit, tMs: fireMs + 50, params: { kind: 'pen', caliberMm: 120, normal: [0, 0, -1] } },
      { id: 'smoke', type: 'engine_smoke', actor: 'heavy', tMs: fireMs + 300, params: {} },
    ],
    storyboard: { version: 1, durationMs: 4400, shots: [
      { id: 'cam', tMs: 0, pos: [heavy[0] - 16, 13, heavy[1] - 27], lookAt: [heavy[0] - 6, 0.5, heavy[1] - 9], fov: 48, rollDeg: 0, transition: 'smooth' },
      { id: 'cam2', tMs: 4400, pos: [heavy[0] - 13, 12, heavy[1] - 25], lookAt: [heavy[0] - 3, 0.8, heavy[1] - 7], fov: 46, rollDeg: 0, transition: 'smooth' },
    ], actorTracks: [{ actor: 'flanker', keys: [
      { id: 'k0', tMs: 0, pos: startPos, facingDeg: 60, turretDeg: -40, gunDeg: 0, transition: 'drive' },
      { id: 'k1', tMs: 2600, pos: endPos, facingDeg: 0, turretDeg: 0, gunDeg: 0, transition: 'drive' },
      { id: 'k2', tMs: 4400, pos: endPos, facingDeg: 0, turretDeg: 0, gunDeg: 0, transition: 'cut' },
    ] }] },
  };
}

/** Hull-down: a tank on the far side of a crest shows only its turret; shots stop on the mantlet. The Studio's own pose
 *  preset finds the crest (applyPosePreset 'hull-down', within 24 m ahead); the tool tries spots round the clearing and
 *  their facings until one has a crest, and the camera stands where the enemy would, low. */
function hullDownScene() {
  const candidates = [];
  for (const [dx, dz] of [[0, 0], [-30, 0], [30, 0], [0, 20], [0, -20], [-20, 15], [20, -15], [45, 0], [-45, 0]]) {
    for (const facing of [0, 90, 180, 270]) candidates.push({ pos: [BASE[0] + dx, BASE[1] + dz], facing });
  }
  return {
    map: MAP, timeOfDay: 'day', seed: 2723, fx: { quality: 'cinematic', ambience: false },
    actors: [{ id: 'm1a1_abrams_hc', name: 'hero', pos: candidates[0].pos, facingDeg: 0, turretDeg: 0, gunDeg: 0, camo: 'auto', state: 'intact' }],
    effects: [],
    storyboard: { version: 1, durationMs: 4000, shots: [], actorTracks: [] },
    pose: 'hull-down', candidates,
  };
}

const SCENES = { angle: angleScene, flank: flankScene, hullDown: hullDownScene };

// --- the run ----------------------------------------------------------------------------------------------------------
const report = { mode: MODE, scenes: {}, errors: [] };
let server, browser, hold;
try {
  hold = await openCaptureHold({ label: 'tutorial-media', place: 'tutorial-media', lockClass: 'render', timeoutMs: 60 * 60_000 });
  server = await createServer({ root: process.cwd(), logLevel: 'error', server: { host: '127.0.0.1', port: 0, hmr: false } });
  await server.listen();
  browser = await launchGuardedBrowser(puppeteer, nativeBrowserLaunchOptions({ headless: 'new', timeout: 120_000, protocolTimeout: 900_000,
    defaultViewport: null, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage',
      '--window-size=1280,840'] }), { label: 'tutorial-media' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on('pageerror', (error) => report.errors.push(String(error?.message ?? error).slice(0, 300)));
  await page.evaluateOnNewDocument(() => {
    Document.prototype.hasFocus = () => true;
    try { localStorage.setItem('cot.telemetry', 'off'); localStorage.setItem('cot.tutorial.v1', '{"garage":"done","battle":"done","tips":"done"}'); } catch { /* none */ }
  });
  const port = server.httpServer.address().port;
  await page.goto(`http://127.0.0.1:${port}/?studio=1&map=${MAP}&nogate=1&telemetry=off`, { waitUntil: 'domcontentloaded', timeout: 300_000 });
  await page.waitForFunction(`${BOOT_LOADED_EXPRESSION} && window.__STUDIO?.active === true && window.__STUDIO.mapId === '${MAP}'`,
    { timeout: 600_000, polling: 1000 });
  mkdirSync(MODE === 'render' ? OUT_MEDIA : OUT_PREVIEW, { recursive: true });

  for (const [id, build] of Object.entries(SCENES)) {
    if (ONLY && !ONLY.includes(id)) continue;
    const scene = build();
    console.log(`[tutorial-media] ${id}: staging`);
    const staged = await page.evaluate(async (input) => {
      const S = window.__STUDIO;
      const { pose, candidates, ...scene } = input;
      // heights authored above the ground: lift each onto the terrain under it (the Studio camera's own ground snap)
      const groundY = (x, z) => { S.setCamera({ pos: [x, 20, z], yawDeg: 0, pitchDeg: 0, groundRel: true }); return S.getCamera().pos[1] - 20; };
      const lift = (p) => (Array.isArray(p) && p.length === 3 ? [p[0], groundY(p[0], p[2]) + p[1], p[2]] : p);
      const liftScene = (sc) => {
        for (const shot of sc.storyboard?.shots ?? []) { shot.pos = lift(shot.pos); shot.lookAt = lift(shot.lookAt); }
        for (const fx of sc.effects ?? []) {
          if (fx.at) fx.at = lift(fx.at);
          if (fx.params?.from) fx.params.from = lift(fx.params.from);
          if (fx.params?.to) fx.params.to = lift(fx.params.to);
        }
        return sc;
      };
      liftScene(scene);
      const missing = scene.actors.map((a) => a.id).filter((tank) => !S.TANK_IDS.includes(tank));
      if (missing.length) return { error: `unknown tanks ${missing.join(', ')}` };
      await S.load(scene);
      await S.ready();
      if (pose) {
        let ok = false;
        for (const candidate of candidates ?? []) {
          S.updateActor('hero', { pos: candidate.pos, facingDeg: candidate.facing });
          if ((ok = S.applyPosePreset('hero', pose))) break;
        }
        if (!ok) return { error: `no crest for ${pose} within 24 m of ${candidates?.length ?? 0} spots` };
        const hero = S.listActors().find((a) => a.name === 'hero');
        const [x, z] = hero.pos;
        const f = (hero.facingDeg * Math.PI) / 180;
        const fwd = [Math.sin(f), Math.cos(f)];
        // the enemy's eye: 60 m ahead of the tank, low; a shot from there stops on the mantlet
        const eye = [x + fwd[0] * 36, z + fwd[1] * 36];
        const mantlet = [x + fwd[0] * 3.2, 2.3, z + fwd[1] * 3.2];
        // the posed scene again, with the enemy's camera and two shots that stop on the mantlet
        const posed = S.state();
        posed.storyboard = { version: 1, durationMs: 4000, actorTracks: [], shots: [
          { id: 'cam', tMs: 0, pos: [eye[0] - fwd[1] * 3, 1.6, eye[1] + fwd[0] * 3], lookAt: [x, 1.7, z], fov: 6.5, rollDeg: 0, transition: 'smooth' },
          { id: 'cam2', tMs: 4000, pos: [eye[0] - fwd[1] * 2.5, 1.6, eye[1] + fwd[0] * 2.5], lookAt: [x, 1.8, z], fov: 6, rollDeg: 0, transition: 'smooth' },
        ] };
        posed.effects = [700, 2300].flatMap((tMs, i) => [
          { id: `in${i}`, type: 'tracer', tMs, params: { from: [eye[0] + i, 2.6, eye[1]], to: mantlet, shellType: 'AP', speedMps: 260, caliberMm: 105 } },
          { id: `hit${i}`, type: 'impact', at: mantlet, tMs: tMs + 230, params: { kind: 'nonpen', caliberMm: 105, normal: [fwd[0], 0.1, fwd[1]] } },
        ]);
        await S.load(liftScene(posed));
        await S.ready();
        return { pose: { pos: hero.pos, facingDeg: hero.facingDeg }, eye, mantlet };
      }
      return { ok: true };
    }, scene);
    if (staged.error) { report.scenes[id] = staged; console.log(`[tutorial-media] ${id}: ${staged.error}`); continue; }
    report.scenes[id] = { staged };
    if (MODE === 'preview') {
      for (const ms of [0, 1000, 2000, 3000, Math.max(0, (scene.storyboard.durationMs ?? 4000) - 200)]) {
        const shot = await page.evaluate(async (t) => {
          const S = window.__STUDIO;
          S.seek(t);
          await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
          return S.capture({ width: 640, height: 360 }).dataURL;
        }, ms);
        writeFileSync(resolve(OUT_PREVIEW, `${id}-${String(ms).padStart(4, '0')}.png`), Buffer.from(shot.split(',')[1], 'base64'));
      }
      console.log(`[tutorial-media] ${id}: previews written`);
    } else {
      const film = await page.evaluate(async (w, h, fps) => {
        const S = window.__STUDIO;
        const result = await S.exportFilm({ width: w, height: h, fps, samples: 4, maxSamples: 16, shutterDeg: 180, audio: false,
          container: 'webm', download: false });
        const bytes = new Uint8Array(await result.blob.arrayBuffer());
        let binary = '';
        for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return { b64: btoa(binary), container: result.container, codec: result.codec, frames: result.frames };
      }, WIDTH, HEIGHT, FPS);
      const raw = resolve(OUT_PREVIEW, `${id}-master.${film.container === 'mp4' ? 'mp4' : 'webm'}`);
      mkdirSync(OUT_PREVIEW, { recursive: true });
      writeFileSync(raw, Buffer.from(film.b64, 'base64'));
      const webm = resolve(OUT_MEDIA, `${id}.webm`);
      const poster = resolve(OUT_MEDIA, `${id}.webp`);
      const encode = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', raw, '-an', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '38',
        '-row-mt', '1', '-deadline', 'good', '-pix_fmt', 'yuv420p', webm], { stdio: 'inherit' });
      if (encode.status !== 0) throw new Error(`${id}: the WebM encode failed`);
      // the poster: the middle frame as PNG (ffmpeg), then WebP (cwebp: this machine's ffmpeg carries no WebP encoder)
      const frame = resolve(OUT_PREVIEW, `${id}-poster.png`);
      const grab = spawnSync('ffmpeg', ['-v', 'error', '-y', '-ss', '2.0', '-i', raw, '-frames:v', '1', frame], { stdio: 'inherit' });
      const still = grab.status === 0 ? spawnSync('cwebp', ['-quiet', '-q', '78', frame, '-o', poster], { stdio: 'inherit' }) : grab;
      if (still.status !== 0) throw new Error(`${id}: the poster encode failed`);
      report.scenes[id] = { staged, frames: film.frames, codec: film.codec, webmBytes: statSync(webm).size, posterBytes: statSync(poster).size };
      console.log(`[tutorial-media] ${id}: ${film.frames} frames, ${statSync(webm).size} B webm, ${statSync(poster).size} B poster`);
    }
  }
  report.ok = true;
} catch (error) {
  report.ok = false;
  report.failure = String(error?.stack ?? error).slice(0, 2000);
  console.error(error);
  process.exitCode = 1;
} finally {
  mkdirSync(OUT_PREVIEW, { recursive: true });
  writeFileSync(resolve(OUT_PREVIEW, `report-${MODE}.json`), `${JSON.stringify(report, null, 2)}\n`);
  await browser?.close().catch(() => {});
  await server?.close().catch(() => {});
  await hold?.release();
}
