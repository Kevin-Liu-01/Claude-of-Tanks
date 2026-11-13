#!/usr/bin/env node
// training-layout-probe.mjs — what the training ground stands on (273). First-party tooling: Kevin B. Liu.
//
// Launches the training battle and reads its battlefield round the training ground (sim/trainingGround.ts): the ground's
// height on a grid, every concealing canopy (sim/spotting.ts ConcealerDisc), every obstacle's footprint, and the line of
// sight from each candidate point to each actor's mark (the ground between them, sampled every 4 m). The scenes' points
// and the actors' marks are chosen from this file (evidence/training-layout/probe.json), never by eye.
//
//   node tools/training-layout-probe.mjs [--box=x0,z0,x1,z1] [--step=10]
//
// Holds the shared capture lock (render class) for one short batch.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import { launchGuardedBrowser } from './browser-launch.mjs';
import { openCaptureHold } from './capture-hold.mjs';
import { readinessExpression } from './game-readiness.mjs';
import { nativeBrowserLaunchOptions } from './native-browser-launch.mjs';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const BOX = arg('box', '-420,-420,120,120').split(',').map(Number);
const STEP = Number(arg('step', '10'));
const OUT = resolve(arg('out', resolve(process.cwd(), '../tutorial-journey-272-evidence/training-layout')));
mkdirSync(OUT, { recursive: true });
const { TRAINING_RULES, TRAINING_POINTS } = await import('../src/sim/trainingGround.ts');

let server, browser, hold;
try {
  hold = await openCaptureHold({ label: 'training-probe', place: 'training-layout', lockClass: 'render', timeoutMs: 15 * 60_000 });
  server = await createServer({ root: process.cwd(), logLevel: 'error', server: { host: '127.0.0.1', port: 0, hmr: false } });
  await server.listen();
  browser = await launchGuardedBrowser(puppeteer, nativeBrowserLaunchOptions({ headless: 'new', timeout: 120_000, protocolTimeout: 600_000,
    defaultViewport: { width: 1280, height: 720 }, args: ['--use-angle=metal', '--no-sandbox', '--disable-dev-shm-usage'] }),
    { label: 'training-probe' });
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem('cot.telemetry', 'off');
      localStorage.setItem('cot.tutorial.v1', JSON.stringify({ garage: 'done', battle: 'done', tips: 'done' }));
    } catch { /* none */ }
  });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?nosplash=1&telemetry=off`, { waitUntil: 'domcontentloaded', timeout: 300_000 });
  await page.waitForFunction(`${readinessExpression('garage')} && !!window.__DEBUG`, { timeout: 600_000, polling: 500 });
  await page.evaluate((specId, mapId) => window.__DEBUG.beginSoloBattle({ specId, mapId, gameMode: 'training' }),
    TRAINING_RULES.loanerSpecId, TRAINING_RULES.mapId);
  await page.waitForFunction(`${readinessExpression('controlsReleased')}`, { timeout: 900_000, polling: 1000 });
  const probe = await page.evaluate((box, step, actors, points) => {
    const world = window.__DEBUG.getWorld();
    const hf = world.heightField;
    const [x0, z0, x1, z1] = box;
    const heights = [];
    for (let z = z0; z <= z1; z += step) {
      const row = [];
      for (let x = x0; x <= x1; x += step) row.push(Math.round(hf.getHeightAt(x, z) * 10) / 10);
      heights.push(row);
    }
    const inBox = (x, z) => x >= x0 && x <= x1 && z >= z0 && z <= z1;
    const concealers = (world.getConcealment?.() ?? []).filter((d) => !d.dead && inBox(d.x, d.z))
      .map((d) => ({ x: Math.round(d.x * 10) / 10, z: Math.round(d.z * 10) / 10, r: Math.round(d.r * 10) / 10, add: d.add }));
    const obstacles = (world.getObstacles?.() ?? []).filter((o) => inBox(o.x ?? o.cx ?? 0, o.z ?? o.cz ?? 0))
      .slice(0, 2000).map((o) => ({ x: Math.round(o.x ?? o.cx), z: Math.round(o.z ?? o.cz), r: Math.round((o.r ?? o.radius ?? Math.max(o.hw ?? 0, o.hd ?? 0)) * 10) / 10, kind: o.kind ?? o.type ?? '' }));
    /** The ground's clearance under the line from a sight 2.4 m up to a target 1.5 m up (m; < 0: the ground blocks). */
    const clearance = (a, b) => {
      const ya = hf.getHeightAt(a.x, a.z) + 2.4, yb = hf.getHeightAt(b.x, b.z) + 1.5;
      const length = Math.hypot(b.x - a.x, b.z - a.z), steps = Math.max(2, Math.ceil(length / 4));
      let least = Infinity;
      for (let i = 1; i < steps; i++) {
        const t = i / steps, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
        least = Math.min(least, ya + (yb - ya) * t - hf.getHeightAt(x, z));
      }
      return Math.round(least * 10) / 10;
    };
    const sight = {};
    for (const [name, point] of Object.entries(points)) {
      sight[name] = Object.fromEntries(actors.map((actor) => [actor.key, {
        rangeM: Math.round(Math.hypot(actor.x - point.x, actor.z - point.z)), clearanceM: clearance(point, actor),
      }]));
    }
    const field = window.__DEBUG.game.tanks.filter((t) => t.state).map((t) => ({ id: t.id, x: t.state.pos.x, z: t.state.pos.z, yaw: t.state.yaw }));
    return { box, step, heights, concealers, obstacleCount: obstacles.length, obstacles, sight, field };
  }, BOX, STEP, TRAINING_RULES.actors, { start: TRAINING_RULES.start, ...TRAINING_POINTS });
  writeFileSync(resolve(OUT, 'probe.json'), `${JSON.stringify(probe)}\n`);
  console.log(`[probe] ${probe.concealers.length} canopies, ${probe.obstacleCount} obstacles, grid ${probe.heights.length}×${probe.heights[0].length}`);
  console.log(`[probe] sight: ${JSON.stringify(probe.sight)}`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  await server?.close().catch(() => {});
  await hold?.release();
}
