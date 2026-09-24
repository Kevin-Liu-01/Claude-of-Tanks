#!/usr/bin/env node
// Terrain uniform-isolation probe (round 47, committed 2026-09-23 by owner approval). After the normal capture of
// each view it zeroes ONE terrain splat uniform at a time (the .z of a vector uniform, the value of a scalar) and
// re-shoots as <map>-<tag>-<view>-no-<uniform>.png, restoring it before the next; --flat-normals also swaps the four
// layer normal maps for a flat (128,128,255) texel and shoots <view>-flat-normals.png. Round 47 used it to prove the
// desert's "black squiggles" were not a palette: no single uniform removed them, the flat-normal frame did. The
// compiled shader is stashed by wrapping each material's onBeforeCompile once and recompiling (terrain.ts keeps no
// reference). QA only: the changes live in the page for the session.
//
//   node tools/terrain-uniform-iso-probe.mjs --root=<worktree> --out=<dir> --maps=desert --views=sw-corner-close \
//     --iso-uniforms=uRipple,uMacro --flat-normals --tag=iso
//
// Hold the probe mutex and run under nice -n 19 (header of tools/map-probe-runtime.mjs). Exit 1 when a map failed or
// a named uniform matched no material (a typo must not pass as "no effect").
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import {
  MAP_PROBE_SETTLE_MS, beginSoloBattle, isMainModule, openGamePage, parseProbeArgs, probeHelp, runProbeCli, sleep,
  withMapProbeSession, writeProbeReceipt,
} from './map-probe-runtime.mjs';
import { MAP_VIEW_PROBE_VIEWPORT, selectMapViews } from './map-view-probe-views.mjs';
import { captureViews } from './map-view-probe.mjs';

const TOOL = 'terrain-uniform-iso-probe';
const ACCEPTS = ['root', 'out', 'maps', 'views', 'tag', 'spec', 'iso-uniforms', 'flat-normals', 'cache-dir'];
const LAYER_NORMAL_UNIFORMS = Object.freeze(['uNrmG', 'uNrmD', 'uNrmR', 'uNrmM']);
const HELP = probeHelp({
  tool: TOOL, accepts: ACCEPTS,
  summary: 'Map-view captures with one terrain splat uniform zeroed at a time (and optionally flat layer normals).',
  notes: ['At least one of --iso-uniforms or --flat-normals is required.'],
});

export function parseUniformIsoArgs(argv) {
  const parsed = parseProbeArgs(argv, { tool: TOOL, accepts: ACCEPTS, defaults: { tag: 'iso' } });
  if (parsed.help) return parsed;
  if (!parsed.options.isoUniforms && !parsed.options.flatNormals) throw new Error('Give --iso-uniforms=<name,...> and/or --flat-normals');
  for (const name of parsed.options.isoUniforms ?? []) {
    if (!/^u[A-Za-z0-9_]+$/.test(name)) throw new Error(`--iso-uniforms names are shader uniforms (uRipple, ...), got "${name}"`);
  }
  parsed.options.viewList = selectMapViews(parsed.options.views);
  return parsed;
}

/** Wrap each splat material's onBeforeCompile to keep its compiled shader; returns the number stashed. */
async function stashTerrainSplatShaders(page) {
  const stashed = await page.evaluate(() => {
    const D = window.__DEBUG; let n = 0;
    D.scene.traverse((o) => {
      const m = o.material;
      if (!m || typeof m.customProgramCacheKey !== 'function' || !String(m.customProgramCacheKey()).startsWith('world-terrain-splat') || m.userData.__isoWrapped) return;
      const original = m.onBeforeCompile, key = m.customProgramCacheKey();
      m.onBeforeCompile = (shader, renderer) => { original.call(m, shader, renderer); m.userData.shader = shader; };
      m.customProgramCacheKey = () => `${key}-iso`; m.userData.__isoWrapped = true; m.needsUpdate = true; n++;
    });
    return n;
  });
  await sleep(MAP_PROBE_SETTLE_MS.recompile);
  return stashed;
}

/** Set (value) or restore (null) one uniform on every stashed splat shader; returns how many materials had it. */
function setTerrainUniform(page, name, value) {
  return page.evaluate(({ name, value }) => {
    const D = window.__DEBUG; let n = 0;
    D.scene.traverse((o) => {
      const m = o.material;
      if (!m || typeof m.customProgramCacheKey !== 'function' || !String(m.customProgramCacheKey()).startsWith('world-terrain-splat')) return;
      const u = m.userData?.shader?.uniforms?.[name]; if (!u) return;
      const vector = typeof u.value === 'object' && u.value && 'z' in u.value;
      if (value === null) {
        if (u.__saved !== undefined) { if (vector) u.value.z = u.__saved; else u.value = u.__saved; }
      } else if (vector) { u.__saved = u.value.z; u.value.z = value; } else { u.__saved = u.value; u.value = value; }
      n++;
    });
    return n;
  }, { name, value });
}

/** Swap (flat=true) or restore the four layer normal maps; returns how many materials were touched. */
function setFlatLayerNormals(page, flat, uniforms = LAYER_NORMAL_UNIFORMS) {
  return page.evaluate(({ flat, uniforms }) => {
    const D = window.__DEBUG; let n = 0;
    D.scene.traverse((o) => {
      const u = o.material?.userData?.shader?.uniforms;
      if (!u || !u[uniforms[0]]) return;
      if (flat) {
        const T = u[uniforms[0]].value.constructor;
        const c = document.createElement('canvas'); c.width = c.height = 4;
        const g = c.getContext('2d'); g.fillStyle = 'rgb(128,128,255)'; g.fillRect(0, 0, 4, 4);
        const tex = new T(c); tex.needsUpdate = true; tex.wrapS = tex.wrapT = 1000; // RepeatWrapping
        for (const k of uniforms) if (u[k]) { u[k].__saved = u[k].value; u[k].value = tex; }
      } else {
        for (const k of uniforms) if (u[k]?.__saved) { u[k].value = u[k].__saved; u[k].__saved = undefined; }
      }
      n++;
    });
    return n;
  }, { flat, uniforms });
}

async function runUniformIsoProbe(options) {
  mkdirSync(options.out, { recursive: true });
  const maps = {};
  const isoUniforms = options.isoUniforms ?? [];
  let ok = true;
  await withMapProbeSession({ root: options.root, cacheDir: options.cacheDir, launch: MAP_VIEW_PROBE_VIEWPORT }, async ({ browser, port }) => {
    for (const mapId of options.maps) {
      let page = null, errors = [];
      try {
        ({ page, errors } = await openGamePage(browser, { port, viewport: MAP_VIEW_PROBE_VIEWPORT }));
        await beginSoloBattle(page, { specId: options.spec, mapId });
        const stashed = await stashTerrainSplatShaders(page);
        if (!stashed) throw new Error('no world-terrain-splat material found to stash');
        const unmatched = new Set();
        const shots = await captureViews(page, {
          out: options.out, mapId, tag: options.tag, views: options.viewList,
          onView: async ({ view }) => {
            const variants = [];
            if (options.flatNormals) {
              const touched = await setFlatLayerNormals(page, true);
              await sleep(MAP_PROBE_SETTLE_MS.toggle);
              const file = `${mapId}-${options.tag}-${view.name}-flat-normals.png`;
              await page.screenshot({ path: path.join(options.out, file) });
              await setFlatLayerNormals(page, false);
              variants.push({ variant: 'flat-normals', file, materials: touched });
            }
            for (const name of isoUniforms) {
              const matched = await setTerrainUniform(page, name, 0);
              await sleep(MAP_PROBE_SETTLE_MS.uniform);
              const file = `${mapId}-${options.tag}-${view.name}-no-${name}.png`;
              await page.screenshot({ path: path.join(options.out, file) });
              await setTerrainUniform(page, name, null);
              if (!matched) unmatched.add(name);
              variants.push({ variant: `no-${name}`, file, materials: matched });
            }
            return { variants };
          },
        });
        if (unmatched.size) throw new Error(`uniform(s) matched no splat material: ${[...unmatched].join(', ')}`);
        maps[mapId] = { stashedMaterials: stashed, shots, pageErrors: errors };
        console.log(`[${TOOL}] ${mapId}: ${shots.length} views × ${isoUniforms.length + (options.flatNormals ? 1 : 0)} variants (stashed ${stashed})`);
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
    ok, isoUniforms, flatNormals: options.flatNormals, normalUniforms: LAYER_NORMAL_UNIFORMS,
    viewport: MAP_VIEW_PROBE_VIEWPORT, views: options.viewList.map((v) => v.name), maps,
  });
  console.log(`[${TOOL}] ${ok ? 'done' : 'FAILED'} → ${receipt}`);
  return { ok, receipt, maps };
}

if (isMainModule(import.meta.url)) await runProbeCli({ help: HELP, parse: parseUniformIsoArgs, run: runUniformIsoProbe });
