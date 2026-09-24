#!/usr/bin/env node
// Map view probe (the rounds' "wall probe", committed 2026-09-23 by owner approval). Fixed-camera captures of a map
// from the AAA map program's view table (tools/map-view-probe-views.mjs) over a private vite server and a headless
// browser: one page per map, a solo battle on the desktop tier, every requested view pinned with
// __DEBUG.rig.setExternalPose and shot as <map>-<tag>-<view>.png. Two runs with different --root (or --tag) are the
// A/B every round from 35 to 47 was judged on: the ring walls (35), border geology (36), skylines and aerial
// perspective (37, tools/map-metrics.mjs skyline), the Redrock basin (39), water past the square (40), sky light on
// shaded faces (42, map-metrics boxes), the dune wind field (43, map-metrics stripe), slope layers (45), the arid
// palettes / mesa rings / shorelines (47). See docs/MAP-BEAUTIFICATION.md "Probes and metrics as tools".
//
//   node tools/map-view-probe.mjs --root=<worktree> --out=<dir> --maps=badlands,desert --views=sw-corner-close,sky-w --tag=a
//
// Hold the probe mutex and run under nice -n 19 (header of tools/map-probe-runtime.mjs). Exit 1 when a map failed.
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import {
  applyGroundPose, beginSoloBattle, isMainModule, openGamePage, parseProbeArgs, probeHelp, runProbeCli,
  withMapProbeSession, writeProbeReceipt,
} from './map-probe-runtime.mjs';
import { MAP_VIEW_PROBE_VIEWPORT, selectMapViews } from './map-view-probe-views.mjs';

const TOOL = 'map-view-probe';
const ACCEPTS = ['root', 'out', 'maps', 'views', 'tag', 'spec', 'cache-dir'];
const HELP = probeHelp({
  tool: TOOL, accepts: ACCEPTS,
  summary: 'Fixed-camera captures of each map from the AAA map program view table (A/B by --root or --tag).',
});

export function parseMapViewProbeArgs(argv) {
  const parsed = parseProbeArgs(argv, { tool: TOOL, accepts: ACCEPTS });
  if (!parsed.help) parsed.options.viewList = selectMapViews(parsed.options.views);
  return parsed;
}

/** Shoot every view of one booted battle page; returns the shots and keeps going past a single bad view. */
export async function captureViews(page, { out, mapId, tag, views, onView = null }) {
  const shots = [];
  for (const view of views) {
    const pose = await applyGroundPose(page, view);
    const file = `${mapId}-${tag}-${view.name}.png`;
    await page.screenshot({ path: path.join(out, file) });
    const shot = { view: view.name, file, pose };
    if (onView) Object.assign(shot, (await onView({ view, file, pose })) || {});
    shots.push(shot);
  }
  return shots;
}

async function runMapViewProbe(options) {
  mkdirSync(options.out, { recursive: true });
  const maps = {};
  let ok = true;
  await withMapProbeSession({ root: options.root, cacheDir: options.cacheDir, launch: MAP_VIEW_PROBE_VIEWPORT }, async ({ browser, port }) => {
    for (const mapId of options.maps) {
      let page = null, errors = [];
      try {
        ({ page, errors } = await openGamePage(browser, { port, viewport: MAP_VIEW_PROBE_VIEWPORT }));
        await beginSoloBattle(page, { specId: options.spec, mapId });
        const shots = await captureViews(page, { out: options.out, mapId, tag: options.tag, views: options.viewList });
        maps[mapId] = { shots, pageErrors: errors };
        console.log(`[${TOOL}] ${mapId}: ${shots.length} views${errors.length ? ` (page errors ${errors.length}: ${errors[0].slice(0, 80)})` : ''}`);
      } catch (error) {
        ok = false;
        maps[mapId] = { failed: String(error?.message || error), pageErrors: errors };
        console.error(`[${TOOL}] ${mapId} FAILED: ${String(error?.stack || error).slice(0, 400)}`);
      } finally {
        if (page) await page.close().catch(() => {});
      }
    }
  });
  const receipt = writeProbeReceipt(options, { ok, viewport: MAP_VIEW_PROBE_VIEWPORT, views: options.viewList.map((v) => v.name), maps });
  console.log(`[${TOOL}] ${ok ? 'done' : 'FAILED'} → ${receipt}`);
  return { ok, receipt, maps };
}

if (isMainModule(import.meta.url)) await runProbeCli({ help: HELP, parse: parseMapViewProbeArgs, run: runMapViewProbe });
