#!/usr/bin/env node
// Terrain layer-flag probe (rounds 45 and 47, committed 2026-09-23 by owner approval). A map-view capture whose
// terrain splat material is recompiled with one flat colour per layer — G(rass) yellow, D(irt) cyan, R(ock) magenta,
// M(acro) blue — so a frame tells WHICH layer paints a surface: round 45 found Monsoon's bare mound and Fjord's
// plaster cliffs were the steep-slope rock layer authored wrong (check 15), round 47 identified the desert / Oasis
// contour bands as the D mask on steep sand faces. QA only: the sourced textures are replaced by solid colours for
// the session, nothing is written to source. Every view of tools/map-view-probe-views.mjs is available.
//
//   node tools/terrain-layer-flag-probe.mjs --root=<worktree> --out=<dir> --maps=monsoon --views=sw-corner-close --tag=flag
//
// Hold the probe mutex and run under nice -n 19 (header of tools/map-probe-runtime.mjs). Exit 1 when a map failed or
// no splat material was found to flag.
import { mkdirSync } from 'node:fs';
import {
  MAP_PROBE_SETTLE_MS, beginSoloBattle, isMainModule, openGamePage, parseProbeArgs, probeHelp, runProbeCli, sleep,
  withMapProbeSession, writeProbeReceipt,
} from './map-probe-runtime.mjs';
import { MAP_VIEW_PROBE_VIEWPORT, selectMapViews } from './map-view-probe-views.mjs';
import { captureViews } from './map-view-probe.mjs';

const TOOL = 'terrain-layer-flag-probe';
const ACCEPTS = ['root', 'out', 'maps', 'views', 'tag', 'spec', 'cache-dir'];
/** Flag albedo per splat layer uniform (uAlbG / uAlbD / uAlbR / uAlbM), rgb bytes. */
export const LAYER_FLAG_PALETTE = Object.freeze({
  uAlbG: Object.freeze([230, 230, 40]), uAlbD: Object.freeze([40, 220, 230]),
  uAlbR: Object.freeze([230, 40, 230]), uAlbM: Object.freeze([40, 60, 230]),
});
const HELP = probeHelp({
  tool: TOOL, accepts: ACCEPTS,
  summary: 'Map-view captures with the terrain splat layers painted as flat flag colours (G yellow, D cyan, R magenta, M blue).',
  notes: ['Layer colours: ' + Object.entries(LAYER_FLAG_PALETTE).map(([k, v]) => `${k} rgb(${v.join(',')})`).join(', ')],
});

export function parseLayerFlagArgs(argv) {
  const parsed = parseProbeArgs(argv, { tool: TOOL, accepts: ACCEPTS, defaults: { tag: 'flag' } });
  if (!parsed.help) parsed.options.viewList = selectMapViews(parsed.options.views);
  return parsed;
}

/** Recompile every world-terrain-splat material with flat flag albedos; returns how many were flagged. */
async function flagTerrainSplatMaterials(page, palette = LAYER_FLAG_PALETTE) {
  const flagged = await page.evaluate((palette) => {
    const D = window.__DEBUG;
    const flag = (r, g, b) => {
      const c = document.createElement('canvas'); c.width = c.height = 8;
      const x = c.getContext('2d'); x.fillStyle = `rgb(${r},${g},${b})`; x.fillRect(0, 0, 8, 8); return c;
    };
    const mats = new Set();
    D.scene.traverse((o) => {
      const m = o.material;
      if (m && typeof m.customProgramCacheKey === 'function' && String(m.customProgramCacheKey()).startsWith('world-terrain-splat')) mats.add(m);
    });
    let n = 0;
    for (const m of mats) {
      const original = m.onBeforeCompile;
      m.onBeforeCompile = (shader, renderer) => {
        original.call(m, shader, renderer);
        const T = shader.uniforms.uAlbG.value.constructor; // THREE.Texture (CanvasTexture-compatible)
        for (const [uniform, rgb] of Object.entries(palette)) {
          if (!shader.uniforms[uniform]) continue;
          const t = new T(flag(...rgb)); t.needsUpdate = true; shader.uniforms[uniform].value = t;
        }
      };
      m.customProgramCacheKey = () => 'world-terrain-splat-layerflag';
      m.needsUpdate = true; n++;
    }
    return n;
  }, palette);
  await sleep(MAP_PROBE_SETTLE_MS.recompile);
  return flagged;
}

async function runLayerFlagProbe(options) {
  mkdirSync(options.out, { recursive: true });
  const maps = {};
  let ok = true;
  await withMapProbeSession({ root: options.root, cacheDir: options.cacheDir, launch: MAP_VIEW_PROBE_VIEWPORT }, async ({ browser, port }) => {
    for (const mapId of options.maps) {
      let page = null, errors = [];
      try {
        ({ page, errors } = await openGamePage(browser, { port, viewport: MAP_VIEW_PROBE_VIEWPORT }));
        await beginSoloBattle(page, { specId: options.spec, mapId });
        const flagged = await flagTerrainSplatMaterials(page);
        if (!flagged) throw new Error('no world-terrain-splat material found to flag');
        const shots = await captureViews(page, { out: options.out, mapId, tag: options.tag, views: options.viewList });
        maps[mapId] = { flaggedMaterials: flagged, shots, pageErrors: errors };
        console.log(`[${TOOL}] ${mapId}: flagged ${flagged} splat material(s), ${shots.length} views`);
      } catch (error) {
        ok = false;
        maps[mapId] = { failed: String(error?.message || error), pageErrors: errors };
        console.error(`[${TOOL}] ${mapId} FAILED: ${String(error?.stack || error).slice(0, 400)}`);
      } finally {
        if (page) await page.close().catch(() => {});
      }
    }
  });
  const receipt = writeProbeReceipt(options, { ok, palette: LAYER_FLAG_PALETTE, viewport: MAP_VIEW_PROBE_VIEWPORT, views: options.viewList.map((v) => v.name), maps });
  console.log(`[${TOOL}] ${ok ? 'done' : 'FAILED'} → ${receipt}`);
  return { ok, receipt, maps };
}

if (isMainModule(import.meta.url)) await runProbeCli({ help: HELP, parse: parseLayerFlagArgs, run: runLayerFlagProbe });
