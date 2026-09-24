#!/usr/bin/env node
// World layer-isolation probe (round 40, committed 2026-09-23 by owner approval). After the normal capture of each
// view it hides the world meshes whose names match ONE pattern at a time and re-shoots as
// <map>-<tag>-<view>-<suffix>.png, restoring visibility before the next. Round 40 ("water past the square") used the
// default four — the sea apron, the ring forest, the ring mesh and the shallow-water sheets — to find which layer
// drew each "step" the oblique views only hinted at. The receipt lists the names each pattern hid and the census of
// apron / horizon / shallow-water / ring meshes on the map; a pattern that hides nothing is recorded as such (an
// inland map has no apron), never silently equal to the base frame.
//
//   node tools/world-layer-isolation-probe.mjs --root=<worktree> --out=<dir> --maps=coastal --views=bird-e-edge,over-e-560 \
//     [--hide="no-apron=shallowWaterSeaApron;no-forest=^horizon-forest"] --tag=layers
//
// Hold the probe mutex and run under nice -n 19 (header of tools/map-probe-runtime.mjs). Exit 1 when a map failed.
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import {
  MAP_PROBE_SETTLE_MS, beginSoloBattle, isMainModule, openGamePage, parseProbeArgs, probeHelp, runProbeCli, sleep,
  withMapProbeSession, writeProbeReceipt,
} from './map-probe-runtime.mjs';
import { MAP_VIEW_PROBE_VIEWPORT, selectMapViews } from './map-view-probe-views.mjs';
import { captureViews } from './map-view-probe.mjs';

const TOOL = 'world-layer-isolation-probe';
const ACCEPTS = ['root', 'out', 'maps', 'views', 'tag', 'spec', 'hide', 'cache-dir'];
/** Round 40's layers: sea apron, ring forest, the ring mesh itself, the shallow-water sheets. */
export const DEFAULT_HIDDEN_LAYERS = Object.freeze([
  Object.freeze({ suffix: 'no-apron', pattern: 'shallowWaterSeaApron' }),
  Object.freeze({ suffix: 'no-forest', pattern: '^horizon-forest' }),
  Object.freeze({ suffix: 'no-ringmesh', pattern: '^horizon-ring$' }),
  Object.freeze({ suffix: 'no-sheet', pattern: '^shallow_water_' }),
]);
const LAYER_CENSUS_PATTERN = 'apron|horizon|shallow_water|ring';
const HELP = probeHelp({
  tool: TOOL, accepts: ACCEPTS,
  summary: 'Map-view captures with one named world layer (mesh-name regex) hidden at a time.',
  notes: ['Default --hide: ' + DEFAULT_HIDDEN_LAYERS.map((h) => `${h.suffix}=${h.pattern}`).join(';')],
});

export function parseLayerIsolationArgs(argv) {
  const parsed = parseProbeArgs(argv, { tool: TOOL, accepts: ACCEPTS, defaults: { tag: 'layers', hide: DEFAULT_HIDDEN_LAYERS } });
  if (!parsed.help) parsed.options.viewList = selectMapViews(parsed.options.views);
  return parsed;
}

/** Names of the world meshes matching a case-insensitive pattern (the layer census). */
function censusWorldMeshes(page, pattern = LAYER_CENSUS_PATTERN) {
  return page.evaluate((src) => {
    const re = new RegExp(src, 'i'); const out = [];
    window.__DEBUG.world.group.traverse((o) => { if (o.isMesh && re.test(o.name)) out.push(o.name); });
    return out;
  }, pattern);
}

/** Hide (visible=false) or restore every world mesh whose name matches; returns the names touched. */
function setWorldLayerVisible(page, pattern, visible) {
  return page.evaluate(({ src, visible }) => {
    const re = new RegExp(src, 'i'); const hit = [];
    window.__DEBUG.world.group.traverse((o) => { if (o.isMesh && re.test(o.name)) { o.visible = visible; hit.push(o.name); } });
    return hit;
  }, { src: pattern, visible });
}

async function runLayerIsolationProbe(options) {
  mkdirSync(options.out, { recursive: true });
  const maps = {};
  let ok = true;
  await withMapProbeSession({ root: options.root, cacheDir: options.cacheDir, launch: MAP_VIEW_PROBE_VIEWPORT }, async ({ browser, port }) => {
    for (const mapId of options.maps) {
      let page = null, errors = [];
      try {
        ({ page, errors } = await openGamePage(browser, { port, viewport: MAP_VIEW_PROBE_VIEWPORT }));
        await beginSoloBattle(page, { specId: options.spec, mapId });
        const census = await censusWorldMeshes(page);
        const shots = await captureViews(page, {
          out: options.out, mapId, tag: options.tag, views: options.viewList,
          onView: async ({ view }) => {
            const layers = [];
            for (const { suffix, pattern } of options.hide) {
              const hidden = await setWorldLayerVisible(page, pattern, false);
              await sleep(MAP_PROBE_SETTLE_MS.toggle);
              const file = `${mapId}-${options.tag}-${view.name}-${suffix}.png`;
              await page.screenshot({ path: path.join(options.out, file) });
              await setWorldLayerVisible(page, pattern, true);
              layers.push({ suffix, pattern, file, hidden: hidden.slice(0, 24), hiddenCount: hidden.length, identicalToBase: hidden.length === 0 });
              if (!hidden.length) console.warn(`[${TOOL}] ${mapId}/${view.name} ${suffix}: pattern /${pattern}/i hid no mesh — frame equals the base`);
            }
            return { layers };
          },
        });
        maps[mapId] = { census: census.slice(0, 48), censusCount: census.length, shots, pageErrors: errors };
        console.log(`[${TOOL}] ${mapId}: ${shots.length} views × ${options.hide.length} layers; census ${census.length} mesh(es)`);
      } catch (error) {
        ok = false;
        maps[mapId] = { failed: String(error?.message || error), pageErrors: errors };
        console.error(`[${TOOL}] ${mapId} FAILED: ${String(error?.stack || error).slice(0, 400)}`);
      } finally {
        if (page) await page.close().catch(() => {});
      }
    }
  });
  const receipt = writeProbeReceipt(options, {
    ok, hide: options.hide, censusPattern: LAYER_CENSUS_PATTERN, viewport: MAP_VIEW_PROBE_VIEWPORT,
    views: options.viewList.map((v) => v.name), maps,
  });
  console.log(`[${TOOL}] ${ok ? 'done' : 'FAILED'} → ${receipt}`);
  return { ok, receipt, maps };
}

if (isMainModule(import.meta.url)) await runProbeCli({ help: HELP, parse: parseLayerIsolationArgs, run: runLayerIsolationProbe });
