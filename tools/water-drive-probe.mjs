#!/usr/bin/env node
// Water drive probe (round 46 / water pass 8, committed 2026-09-23 by owner approval). Teleports the player hull to a
// map's shore entry point, drives it into the lake under a throttle governor that holds a fording pace (--speed m/s,
// default 7), and captures the wake from hull-relative poses — chase (behind, above), bird (high, slightly behind),
// side (low, off the starboard flank) — at 1.5 / 3.5 / 5 / 6 s after entering the water, then 1.5 and 4.5 s after
// stopping, and finally from a fixed world camera on the entry shore looking along the path: the churn trail must lie
// where the water was churned, not follow the hull. Reservoir and Coastal before/after frames judged pass 8; the
// receipt records each shot's hull position, speed and water mask. Enemies stay alive (ending the battle would raise
// the report card).
//
//   node tools/water-drive-probe.mjs --root=<worktree> --out=<dir> --maps=reservoir,coastal [--spec=t90m_x] [--speed=7] --tag=a
//
// Hold the probe mutex and run under nice -n 19 (header of tools/map-probe-runtime.mjs). Exit 1 when a map failed or
// the hull never reached the water.
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import {
  HULL_RELATIVE_POSES, MAP_PROBE_FOV, beginSoloBattle, isMainModule, openGamePage, parseProbeArgs, probeHelp,
  resolveHullRelativePose, runProbeCli, sleep, withMapProbeSession, writeProbeReceipt,
} from './map-probe-runtime.mjs';
import { MAP_VIEW_PROBE_VIEWPORT } from './map-view-probe-views.mjs';

const TOOL = 'water-drive-probe';
const ACCEPTS = ['root', 'out', 'maps', 'tag', 'spec', 'speed', 'cache-dir'];
/** Shore entry points ~30 m outside the water, heading straight in (forward = (sin yaw, cos yaw)). */
export const WATER_DRIVE_ENTRIES = Object.freeze({
  reservoir: Object.freeze({ x: 24, z: -26, yaw: Math.PI / 2 }),   // lake 1 centre (164, -26) r 110, from the west
  coastal: Object.freeze({ x: 250, z: -60, yaw: Math.PI / 2 }),    // sea (460, -60) r 190, from the west
  fjord: Object.freeze({ x: 230, z: -142, yaw: Math.PI / 2 }),     // fjord water (438, -142) r 188
  oasis: Object.freeze({ x: -161, z: -120, yaw: 0 }),              // oasis lake (-161, 30) r 112, from the south
  skybridge: Object.freeze({ x: -34, z: -60, yaw: 0 }),            // lake (-34, 62) r 92, from the south
  alpine: Object.freeze({ x: 58, z: -180, yaw: 0 }),               // lake (58, -34) r 116, from the south
});
/** The capture schedule: seconds after entering the water / after stopping, and the pose of each shot. */
const WATER_DRIVE_SCHEDULE = Object.freeze({
  enteredS: Object.freeze([[1.5, 'in-1.5s-chase', 'chase'], [3.5, 'in-3.5s-bird', 'bird'], [5.0, 'in-5s-side', 'side'], [6.0, 'in-6s-chase', 'chase']]),
  stoppedS: Object.freeze([[1.5, 'stop-1.5s-chase', 'chase'], [4.5, 'stop-4.5s-chase', 'chase'], [4.5, 'stop-4.5s-bird', 'bird'], [4.5, 'stop-4.5s-side', 'side']]),
  fixed: 'stop-8s-fixed',
});
const HELP = probeHelp({
  tool: TOOL, accepts: ACCEPTS, defaults: { speed: 7 },
  summary: 'Drive the player hull into a lake at a fording pace and capture the wake from chase / bird / side / fixed poses.',
  notes: ['Maps with an entry point: ' + Object.keys(WATER_DRIVE_ENTRIES).join(', ')],
});

export function parseWaterDriveArgs(argv) {
  const parsed = parseProbeArgs(argv, { tool: TOOL, accepts: ACCEPTS, defaults: { speed: 7 } });
  if (parsed.help) return parsed;
  const missing = parsed.options.maps.filter((m) => !WATER_DRIVE_ENTRIES[m]);
  if (missing.length) throw new Error(`No shore entry point for ${missing.join(', ')} (see WATER_DRIVE_ENTRIES in tools/water-drive-probe.mjs)`);
  return parsed;
}

/** Pin the camera relative to the live hull with the tested pose math; returns the hull sample for the receipt. */
function applyHullRelativePose(page, kind) {
  return page.evaluate(`(() => {
    const resolveHullRelativePose = ${resolveHullRelativePose.toString()};
    const D = window.__DEBUG; const st = D.game.player.state; const V = D.camera.position.constructor;
    const pose = resolveHullRelativePose({ pos: st.pos, yaw: st.yaw }, ${JSON.stringify(kind)}, ${JSON.stringify(HULL_RELATIVE_POSES)}, ${MAP_PROBE_FOV});
    D.rig.setExternalPose(new V(...pose.cam), new V(...pose.at), pose.fov);
    return { x: +st.pos.x.toFixed(1), z: +st.pos.z.toFixed(1), speed: +st.speed.toFixed(2), water: +D.world.heightField.getWaterMaskAt(st.pos.x, st.pos.z).toFixed(2) };
  })()`);
}

function applyFixedShorePose(page, cam, at) {
  return page.evaluate(({ cam, at, fov }) => {
    const D = window.__DEBUG; const V = D.camera.position.constructor; const hf = D.world.heightField;
    D.rig.setExternalPose(new V(cam[0], hf.getHeightAt(cam[0], cam[2]) + cam[1], cam[2]), new V(at[0], hf.getHeightAt(at[0], at[2]) + at[1], at[2]), fov);
  }, { cam, at, fov: MAP_PROBE_FOV });
}

async function driveMap(page, { mapId, entry, out, tag, targetSpeed }) {
  // teleport to the entry point facing the water; cap the hull's own top speed to a fording pace when the spec is writable
  const capped = await page.evaluate(({ e, kmh }) => {
    const D = window.__DEBUG; const st = D.game.player.state; const hf = D.world.heightField;
    st.pos.set(e.x, hf.getHeightAt(e.x, e.z) + 0.8, e.z); st.yaw = e.yaw; st.speed = 0; st.turretYaw = 0;
    try { const spec = D.game.player.spec; if (spec && !Object.isFrozen(spec)) { spec.topSpeedKmh = kmh; return spec.topSpeedKmh === kmh; } } catch { /* read-only spec */ }
    return false;
  }, { e: entry, kmh: Math.round(targetSpeed * 3.6) });
  await sleep(1500);
  const shots = [];
  const shot = async (name, kind) => {
    const info = kind ? await applyHullRelativePose(page, kind) : null;
    await sleep(260);
    const file = `${mapId}-${tag}-${name}.png`;
    await page.screenshot({ path: path.join(out, file) });
    shots.push({ name, pose: kind ?? 'fixed', file, ...(info || {}) });
  };
  const sample = () => page.evaluate(() => {
    const D = window.__DEBUG; const st = D.game.player.state;
    return { x: st.pos.x, z: st.pos.z, speed: st.speed, water: D.world.heightField.getWaterMaskAt(st.pos.x, st.pos.z) };
  });
  await shot('start-chase', 'chase');
  // throttle governor: hold W only while below the target speed — a fording pace, not a road sprint
  let throttle = true, stopLoop = false, keyDown = false, last = null;
  const governor = (async () => {
    while (!stopLoop) {
      try { last = await sample(); } catch { break; }
      const want = throttle && (capped || last.speed < targetSpeed);
      if (want && !keyDown) { await page.keyboard.down('KeyW'); keyDown = true; }
      else if (!want && keyDown) { await page.keyboard.up('KeyW'); keyDown = false; }
      await sleep(50);
    }
    if (keyDown) { await page.keyboard.up('KeyW'); keyDown = false; }
  })();
  try {
    const t0 = Date.now(); let entered = null;
    while (Date.now() - t0 < 30000) { if (last && last.water > 0.5) { entered = Date.now(); break; } await sleep(60); }
    if (entered === null) throw new Error('never reached the water within 30 s');
    const sinceEntry = async (s) => { const wait = entered + s * 1000 - Date.now(); if (wait > 0) await sleep(wait); };
    for (const [s, name, kind] of WATER_DRIVE_SCHEDULE.enteredS) { await sinceEntry(s); await shot(name, kind); }
    throttle = false;
    const tStop = Date.now();
    const afterStop = async (s) => { const wait = tStop + s * 1000 - Date.now(); if (wait > 0) await sleep(wait); };
    for (const [s, name, kind] of WATER_DRIVE_SCHEDULE.stoppedS) { await afterStop(s); await shot(name, kind); }
    // fixed world camera on the entry shore looking along the path: the trail should lie where the tank was
    const fx = Math.sin(entry.yaw), fz = Math.cos(entry.yaw);
    await applyFixedShorePose(page, [entry.x + fx * 26, 7, entry.z + fz * 26 + 6], [entry.x + fx * 90, -1, entry.z + fz * 90]);
    await shot(WATER_DRIVE_SCHEDULE.fixed, null);
  } finally {
    stopLoop = true; await governor;
  }
  return { capped, shots };
}

async function runWaterDriveProbe(options) {
  mkdirSync(options.out, { recursive: true });
  const maps = {};
  let ok = true;
  await withMapProbeSession({ root: options.root, cacheDir: options.cacheDir, launch: MAP_VIEW_PROBE_VIEWPORT }, async ({ browser, port }) => {
    for (const mapId of options.maps) {
      let page = null, errors = [];
      try {
        ({ page, errors } = await openGamePage(browser, { port, viewport: MAP_VIEW_PROBE_VIEWPORT }));
        await beginSoloBattle(page, { specId: options.spec, mapId, settleMs: 1200 });
        const { capped, shots } = await driveMap(page, { mapId, entry: WATER_DRIVE_ENTRIES[mapId], out: options.out, tag: options.tag, targetSpeed: options.speed });
        maps[mapId] = { entry: WATER_DRIVE_ENTRIES[mapId], topSpeedCapped: capped, shots, pageErrors: errors };
        console.log(`[${TOOL}] ${mapId}: ${shots.length} shots ${JSON.stringify(shots.map((s) => [s.name, s.x, s.z, s.speed, s.water]))}${errors.length ? ` (page errors ${errors.length}: ${errors[0].slice(0, 100)})` : ''}`);
      } catch (error) {
        ok = false;
        maps[mapId] = { failed: String(error?.message || error), pageErrors: errors };
        console.error(`[${TOOL}] ${mapId} FAILED: ${String(error?.stack || error).slice(0, 400)}`);
      } finally {
        if (page) await page.close().catch(() => {});
      }
    }
  });
  const receipt = writeProbeReceipt(options, { ok, targetSpeedMps: options.speed, poses: HULL_RELATIVE_POSES, schedule: WATER_DRIVE_SCHEDULE, viewport: MAP_VIEW_PROBE_VIEWPORT, maps });
  console.log(`[${TOOL}] ${ok ? 'done' : 'FAILED'} → ${receipt}`);
  return { ok, receipt, maps };
}

if (isMainModule(import.meta.url)) await runProbeCli({ help: HELP, parse: parseWaterDriveArgs, run: runWaterDriveProbe });
