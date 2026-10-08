#!/usr/bin/env node
// Frame-budget probe (2026-10-02, the frame-budget lane): per-pass GPU and CPU cost of a live battle frame, in
// A B B A pairs across production builds, with the mid-range projection the docs' frame budget reads.
//
//   node tools/frame-budget-probe.mjs --roots=<treeA>,<treeB> --labels=base,new --maps=verdant,desert,whiteout,monsoon \
//        [--pattern=ABBA] [--views=chase,centre-far] [--viewports=1600x900,1920x1080] [--frames=240] [--block=30] \
//        [--sides=13x14] [--spec=t90m_x] [--preset=high] [--governor=pinned|live] [--emulate=<proxy>] \
//        [--queries=,<query>] [--toggle=<name>] [--shots] [--port=5395] [--session-mutex=<dir>] [--budget-min=18] \
//        [--hide-bots[=0|1]] [--out=<dir>] [--tag=<tag>]
//   node tools/frame-budget-probe.mjs --report=<dir>[,<dir>...] [--labels=base,new]
//
// Every root is a checkout with a production build in <root>/dist (`npm run build`); the probe serves one root at
// a time through `vite preview` on --port (127.0.0.1) and opens ONE headless Chrome (hardware ANGLE, the repo's
// capture flags) for the run. Per slot (one page): the desktop preset pinned in storage before boot (an explicit
// choice, so the session auto tier cannot step down), the sides switch at --sides (13x14 = the 14 v 14 preset), a
// pinned roster (every production id but the player, sorted, every k-th — the same 27 opponents on every build of
// one catalog; the receipt lists them), a solo battle through __DEBUG.beginSoloBattle, the sourced textures
// awaited, every bot frozen, the render governor pinned at full scale (unless --governor=live), then per viewport
// (a resize in the same page) and per view: the pose, a settle, and --frames rendered frames through the per-pass
// timer (tools/frame-pass-timer.mjs; segmented and whole-frame blocks alternate, the whole frames check the
// per-pass sum). --toggle=<name> samples A B B A blocks of a runtime switch inside the page at every pose (the
// same scene, the same pose: the tightest A/B there is). --emulate=<proxy> adds a GPU-only load after every frame
// that tracks (1/ratio − 1) × the frame's own GPU time, so this GPU presents the proxy's frame times to a live
// governor. Locks: the machine-wide capture FIFO (tools/capture-lock.mjs) for the whole run; with --session-mutex,
// that directory too, taken only once the FIFO is ours and released with it (a busy mutex gives the FIFO back).
//
// The pages' agreement (2026-10-05, the ground lane's hold 51: the base's page drew 685 scene draws and 3.50 M triangles,
// its twin — the same dist — 369 and 3.20 M, and the twin's "null" of −8.3 ms compared two scenes): every slot reads its
// scene's draws and triangles at the first pose before it measures, with a census of its visible meshes, and
// judgeScenes holds it against the slots before it. Scene identity is the twins' triangles (slots of one root) within
// --twin-tris-tol (3 %); draws may wander --draws-tol (25 %: dynamic culling moves them ±11 % within one dist, and
// they only need to catch a gross difference such as hold 51's 46 %); another build's own delta is accepted
// once two of its stagings in a row repeat their triangles within --stable-tol (1 %). A slot that fails is staged again
// before it measures (three readings at most); an earlier slot the judgement implicates is measured again at the end of
// the run; a slot whose measured counts leave its staged reading, or a report whose slots disagree at a pose, is VOID.
// --scene-check=off turns the gate off (a change that adds or removes draws on purpose).
//
// --hide-bots (cost rule v3, amended 2026-10-07; the mr2 draw census): every bot's vehicle is taken out of the frame
// (its render root hidden, every layer of it off, so no camera nor shadow camera draws it) once the battle is frozen.
// The frozen bots stand wherever their routes put them at entry, and a build that changes a map's routes put a 62-draw
// ally in its chase frame in every cycle: tank draws, not the map's cost. Default on for map holds (the default staging
// --spec) and off for a vehicle hold (one that names its own --spec); =0 / =1 overrides. Each slot records the count.
//
// The terrain's LOD stream (2026-10-07, mr3; the whole-PR census): a staged map keeps building its fine terrain grids for
// ~10 s or more (terrain.ts updateLOD: 9,801 height samples a chunk, up to ~2 ms a frame until every chunk is done), longer
// on a map with costlier heights, so the pages of a hold sampled different loads. Every pose now settles the stream first
// (world-residency-acquisition's settleResidencyTerrain: the lookahead built job by job until none is pending at the
// camera), and every sample records the geometries streamed while it ran (streamedDuring: 0 when the settle held).

import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { preview } from 'vite';
import puppeteer from 'puppeteer';
import {
  HULL_RELATIVE_POSES, MAP_PROBE_BROWSER_ARGS, MAP_PROBE_FOV, applyGroundPose, beginSoloBattle, isMainModule,
  resolveHullRelativePose, sleep,
} from './map-probe-runtime.mjs';
import { selectMapViews } from './map-view-probe-views.mjs';
import { CAPTURE_QUEUE_DIR, createCaptureLock } from './capture-lock.mjs';
import { settleResidencyTerrain } from './world-residency-acquisition.mjs';
import { captureLuminance, encodeLum } from './frame-capture-compare.mjs';
import {
  FRAME_PASS_TIMER_PROTOCOL, MID_RANGE_PROXIES, installFramePassTimer, pairDeltas, projectFrameMs, proxyRatios,
  summarizePassFrames,
} from './frame-pass-timer.mjs';

const TOOL = 'frame-budget-probe';
const DEFAULTS = Object.freeze({
  pattern: 'ABBA', views: ['chase', 'centre-far'], viewports: ['1600x900', '1920x1080'], frames: 240, block: 30,
  sides: '13x14', spec: 't90m_x', preset: 'high', governor: 'pinned', port: 5395, budgetMin: 18, settleMs: 2500,
  tier: 'desktop', profileSeconds: 0, prefixFrames: 330, noFlush: false, segmented: false, scales: null, liveSeconds: 40,
  twinTrisTol: 3, drawsTol: 25, stableTol: 1, sceneCheck: true,
  hideBots: 'auto',
});
/** The prefix checkpoints a toggle block rotates through (its last one is the whole frame). */
const TOGGLE_CHECKPOINTS = Object.freeze(['world', 'clouds', 'shadow', 'scene', 'upscale']);
/** The CPU / draw labels each prefix step covers (the timer's labels refine world and shadow by render target). */
const STEP_LABELS = Object.freeze({
  world: ['world', 'world-water', 'world-grass', 'world-ocean'], clouds: ['clouds'],
  shadow: ['shadow', 'shadow-c0', 'shadow-c1', 'shadow-c2', 'shadow-c3'], scene: ['scene'],
});
/** Runtime A/B switches the probe can flip inside one page (off = the baseline). */
const FRAME_PROBE_TOGGLES = Object.freeze({
  // the static shadow-caster cache (engine/shadowStaticCache.ts): off forces every caster every frame
  'shadow-cache': Object.freeze({ on: 'window.__SHADOW_DEBUG = Object.assign(window.__SHADOW_DEBUG || {}, { noStaticCache: false })',
    off: 'window.__SHADOW_DEBUG = Object.assign(window.__SHADOW_DEBUG || {}, { noStaticCache: true })' }),
  // the cache's depth copy (2026-10-08, the perf lane: what one copy costs): the cache on both sides; on copies every depth
  // texture twice (the same texels again, so the picture holds), off once — the delta is one copy per copy the cache made
  // (the block's cache record counts them). The wrapper is installed by the first switch and stays, so both sides run it.
  'shadow-cache-copy2': Object.freeze({ on: shadowCacheCopyToggle(true), off: shadowCacheCopyToggle(false) }),
  // the scenery lane's field walls and everything on them (gauntlet wave 34): the wall pools (their modules carry a snow
  // map's snow load), the field prints' buckets (the run heads, the foot stones, the breaches, the mud aprons) and the
  // snow drifts; off hides them all, so the delta is the walls' whole frame cost (an upper bound on what the dressing
  // added to them)
  'field-walls': Object.freeze({
    on: `window.__DEBUG.scene.traverse((o) => { if (/^(destructible-wall(stone|adobe)(-broken)?|props-bucket-field(Stone|Mud)|props-snow-drifts)$/.test(o.name)) o.visible = true; })`,
    off: `window.__DEBUG.scene.traverse((o) => { if (/^(destructible-wall(stone|adobe)(-broken)?|props-bucket-field(Stone|Mud)|props-snow-drifts)$/.test(o.name)) o.visible = false; })` }),
  // the scenery lane (wave 34): the sandbag stacks and the nests' bedding (sceneryKit.ts buildSandbagStack and
  // buildSandbagBedding: the spoil, the spill and the emptied bag); off hides them, so the delta is their whole cost
  'sandbag-nests': Object.freeze({
    on: `window.__DEBUG.scene.traverse((o) => { if (/^(destructible-sandbag(big|small|wall)(-broken)?|props-sandbag-beds)$/.test(o.name)) o.visible = true; })`,
    off: `window.__DEBUG.scene.traverse((o) => { if (/^(destructible-sandbag(big|small|wall)(-broken)?|props-sandbag-beds)$/.test(o.name)) o.visible = false; })` }),
  // the scenery lane (wave 48, the merge's bench): both of the above at once — the field walls with their dressing and
  // the sandbag nests with their bedding
  'scenery-dressing': Object.freeze({
    on: `window.__DEBUG.scene.traverse((o) => { if (/^(destructible-wall(stone|adobe)(-broken)?|props-bucket-field(Stone|Mud)|props-snow-drifts|destructible-sandbag(big|small|wall)(-broken)?|props-sandbag-beds)$/.test(o.name)) o.visible = true; })`,
    off: `window.__DEBUG.scene.traverse((o) => { if (/^(destructible-wall(stone|adobe)(-broken)?|props-bucket-field(Stone|Mud)|props-snow-drifts|destructible-sandbag(big|small|wall)(-broken)?|props-sandbag-beds)$/.test(o.name)) o.visible = false; })` }),
  // the scenery lane (wave 48): the power lines' conductors on the wire material (wireMaterial.ts, one mesh); a tree
  // without that mesh has nothing to hide (its conductors are in the baked bucket), so read the toggle on the new tree
  'pylon-wires': Object.freeze({
    on: `window.__DEBUG.scene.traverse((o) => { if (o.name === 'props-pylon-wires') o.visible = true; })`,
    off: `window.__DEBUG.scene.traverse((o) => { if (o.name === 'props-pylon-wires') o.visible = false; })` }),
  // the scenery lane (wave 52): the boulders (props.ts rock-variant-0..2, and since the wave-74 cascade trim each one's
  // -far pool and its -shadow pool for the far cascades); off hides them, so the delta is their whole frame cost. Both
  // sides run without the static shadow cache, so every cascade redraws every boulder every frame, as it does while the
  // camera moves (an upper bound). ('on' restores a pool's own visibility: an empty LOD pool stays hidden.)
  'boulders': Object.freeze({
    on: `window.__SHADOW_DEBUG = Object.assign(window.__SHADOW_DEBUG || {}, { noStaticCache: true }); window.__DEBUG.scene.traverse((o) => { if (/^rock-variant-\\d(-far|-shadow)?$/.test(o.name)) o.visible = o.isInstancedMesh ? o.count > 0 : true; })`,
    off: `window.__SHADOW_DEBUG = Object.assign(window.__SHADOW_DEBUG || {}, { noStaticCache: true }); window.__DEBUG.scene.traverse((o) => { if (/^rock-variant-\\d(-far|-shadow)?$/.test(o.name)) o.visible = false; })` }),
  // the null control beside a toggle under a millisecond (docs/PERFORMANCE.md, "Light presets"): the same static
  // shadow cache state as the boulders' toggle, and a switch nothing reads, so its on-off delta is the machine's own
  // drift between blocks under other sessions' load
  'null-control': Object.freeze({
    on: `window.__SHADOW_DEBUG = Object.assign(window.__SHADOW_DEBUG || {}, { noStaticCache: true }); window.__COT_NULL_CONTROL = 1`,
    off: `window.__SHADOW_DEBUG = Object.assign(window.__SHADOW_DEBUG || {}, { noStaticCache: true }); window.__COT_NULL_CONTROL = 0` }),
  // the scenery lane (after wave 57): the telegraph poles (props.ts baked-pole-full and baked-pole-distance, the two
  // instanced pools of the sourced pole and its distance model); off hides them, so the delta is their whole frame cost.
  // Both sides run without the static shadow cache (an upper bound, as for the boulders)
  'telegraph-poles': Object.freeze({
    on: `window.__SHADOW_DEBUG = Object.assign(window.__SHADOW_DEBUG || {}, { noStaticCache: true }); window.__DEBUG.scene.traverse((o) => { if (/^baked-pole-(full|distance)$/.test(o.name)) o.visible = o.isInstancedMesh ? o.count > 0 : true; })`,
    off: `window.__SHADOW_DEBUG = Object.assign(window.__SHADOW_DEBUG || {}, { noStaticCache: true }); window.__DEBUG.scene.traverse((o) => { if (/^baked-pole-(full|distance)$/.test(o.name)) o.visible = false; })` }),
  // the water / grass simulations' idle sleep (waterRipples.ts, groundPressure.ts): off steps them every frame; the
  // ripple field falls asleep only after 20 s of quiet, so an 'on' block that follows an 'off' one waits that long
  'sim-sleep': Object.freeze({ on: 'window.__WORLD_SIM_DEBUG = Object.assign(window.__WORLD_SIM_DEBUG || {}, { noSleep: false })',
    off: 'window.__WORLD_SIM_DEBUG = Object.assign(window.__WORLD_SIM_DEBUG || {}, { noSleep: true })', onSettleMs: 21000 }),
  // the map-borders lane's additions past the edge (gauntlet wave 40): the farmsteads (hamlets, villages, churches, the
  // regional kits' buildings), the hedgerows and the ring forest's rows (shelter belts, road avenues: the placements
  // keyed below zero), drawn and cast; off hides them all, so the delta is their whole frame cost (an upper bound on
  // what the lane added: the head's own farms and hedges go too). Both sides run without the static shadow cache, so
  // every cascade redraws every caster every frame, as it does while the camera moves.
  'border-additions': Object.freeze({ on: borderAdditionsToggle(true), off: borderAdditionsToggle(false) }),
  // the mountains lane (2026-10-04, waves 53-54's bird views): the far shell's ground over its skyline under a high
  // camera's horizon (horizonPanorama.ts, the far earth and the apron); off is the shell before it (every texel over the
  // skyline open), so the delta is its whole cost on the shell's sky-reading fragments
  'far-earth': Object.freeze({
    on: `(() => { let n = 0; window.__DEBUG.scene.traverse((o) => { const a = o.userData && o.userData.panoAir; if (!a) return; if (a.offSkyline !== undefined) { a.uPanoSkyline.value = a.offSkyline; delete a.offSkyline; } a.uPanoHaze.value.w = a.uPanoHaze.value.x > 0 ? 1 : 0; n++; }); return { shells: n }; })()`,
    off: `(() => { let n = 0; window.__DEBUG.scene.traverse((o) => { const a = o.userData && o.userData.panoAir; if (!a) return; if (a.offSkyline === undefined) a.offSkyline = a.uPanoSkyline.value; a.uPanoSkyline.value = null; a.uPanoHaze.value.w = 0; n++; }); return { shells: n }; })()` }),
  // its null control (docs/PERFORMANCE.md: a control beside any toggle under a millisecond): the same scene walk and
  // the same shells found, a flag the shader never reads switched, so its quartets give the blocks' own noise
  'far-earth-null': Object.freeze({
    on: `(() => { let n = 0; window.__DEBUG.scene.traverse((o) => { const a = o.userData && o.userData.panoAir; if (!a) return; a.nullControl = 1; n++; }); return { shells: n }; })()`,
    off: `(() => { let n = 0; window.__DEBUG.scene.traverse((o) => { const a = o.userData && o.userData.panoAir; if (!a) return; a.nullControl = 0; n++; }); return { shells: n }; })()` }),
});

/** The in-page switch of the cache's depth copy (the shadow-cache-copy2 toggle): copy each depth texture twice, or once. */
export function shadowCacheCopyToggle(twice) {
  return `(() => {
    const R = window.__DEBUG.renderer;
    window.__SHADOW_DEBUG = Object.assign(window.__SHADOW_DEBUG || {}, { noStaticCache: false });
    if (!R.__fbpCopyOnce) {
      const once = R.copyTextureToTexture;
      R.__fbpCopyOnce = once;
      R.copyTextureToTexture = function (src, dst, ...rest) {
        once.call(this, src, dst, ...rest);
        if (R.__fbpCopyTwice && src && src.isDepthTexture) once.call(this, src, dst, ...rest);
      };
    }
    R.__fbpCopyTwice = ${twice ? 'true' : 'false'};
    return { copies: ${twice ? 2 : 1} };
  })()`;
}

/**
 * The in-page switch for the border additions: shows or hides the farmsteads and the hedgerows, and draws each ring
 * forest pool (impostors, shadow proxies, lobes) with or without its row trees. The first call moves each pool's row
 * instances behind the rest (every instanced attribute alike, matched by the instance's position to the row
 * placements); after that the switch only sets the pool's draw count.
 */
export function borderAdditionsToggle(show) {
  return `(() => {
    const show = ${show ? 'true' : 'false'};
    window.__SHADOW_DEBUG = Object.assign(window.__SHADOW_DEBUG || {}, { noStaticCache: true });
    const out = { farms: 0, hedges: 0, rows: 0, pools: 0, hidden: 0, impostors: 0 };
    window.__DEBUG.scene.traverse((o) => {
      if (o.name === 'border-farmsteads') { o.visible = show; out.farms++; }
      if (o.name === 'border-hedgerows') { o.visible = show; out.hedges++; }
      const record = o.userData && o.userData.horizonForest;
      if (!record || !record.placements) return;
      const P = record.placements, rows = new Set();
      for (let o2 = 0; o2 + 9 < P.length; o2 += 10) if (P[o2 + 8] < 0) rows.add(P[o2] + ',' + P[o2 + 2]);
      out.rows += rows.size;
      if (o.userData.horizonForestImpostors) out.impostors++;
      for (const mesh of o.children) {
        if (!mesh.isInstancedMesh) continue;
        let split = mesh.userData.borderRowSplit;
        if (!split) {
          const full = mesh.count, m = mesh.instanceMatrix.array, keep = [], drop = [];
          for (let j = 0; j < full; j++) (rows.has(m[j * 16 + 12] + ',' + m[j * 16 + 14]) ? drop : keep).push(j);
          const order = keep.concat(drop);
          const permute = (attr) => {
            if (!attr) return;
            const size = attr.itemSize, src = attr.array.slice();
            for (let k = 0; k < order.length; k++) for (let c = 0; c < size; c++) attr.array[k * size + c] = src[order[k] * size + c];
            attr.needsUpdate = true;
          };
          permute(mesh.instanceMatrix);
          permute(mesh.instanceColor);
          for (const name of Object.keys(mesh.geometry.attributes)) {
            const attr = mesh.geometry.attributes[name];
            if (attr.isInstancedBufferAttribute && attr.count === full) permute(attr);
          }
          split = mesh.userData.borderRowSplit = { full, kept: keep.length };
        }
        mesh.count = show ? split.full : split.kept;
        out.pools++;
        out.hidden += split.full - mesh.count;
      }
    });
    return out;
  })()`;
}

// ---------------------------------------------------------------------------------------------- arguments

export function parseFrameProbeArgs(argv) {
  const o = { ...DEFAULTS, roots: null, labels: null, maps: null, queries: null, toggle: null, shots: false, out: null,
    tag: 'fb', sessionMutex: null, report: null, emulate: null };
  const list = (v) => v.split(',').map((s) => s.trim()).filter(Boolean);
  for (const arg of argv) {
    const m = /^--([a-z][a-z-]*)(?:=(.*))?$/s.exec(arg);
    if (!m) throw new Error(`Unknown argument "${arg}" (flags are --name=value)`);
    const [, name, raw] = m;
    const need = () => { if (raw === undefined || raw === '') throw new Error(`--${name} needs a value`); return raw; };
    switch (name) {
      case 'roots': o.roots = list(need()).map((r) => path.resolve(r)); break;
      case 'labels': o.labels = list(need()); break;
      case 'maps': o.maps = list(need()); break;
      case 'views': o.views = list(need()); break;
      case 'viewports': o.viewports = list(need()); break;
      case 'pattern': o.pattern = need().toUpperCase(); break;
      case 'frames': o.frames = Math.max(30, Number(need()) || DEFAULTS.frames); break;
      case 'block': o.block = Math.max(5, Number(need()) || DEFAULTS.block); break;
      case 'sides': o.sides = need(); break;
      case 'spec': o.spec = need(); break;
      case 'preset': o.preset = need(); break;
      case 'governor': o.governor = need(); break;
      case 'emulate': o.emulate = need(); break;
      case 'queries': o.queries = (raw ?? '').split(','); break;
      case 'toggle': o.toggle = need(); break;
      case 'shots': if (raw !== undefined) throw new Error('--shots takes no value'); o.shots = true; break;
      case 'hide-bots':
        if (raw === undefined || raw === '1') o.hideBots = true;
        else if (raw === '0') o.hideBots = false;
        else throw new Error('--hide-bots takes no value, =0 or =1');
        break;
      case 'port': o.port = Number(need()); break;
      case 'session-mutex': o.sessionMutex = path.resolve(need()); break;
      case 'budget-min': o.budgetMin = Number(need()); break;
      case 'settle-ms': o.settleMs = Number(need()); break;
      case 'prefix-frames': o.prefixFrames = Math.max(0, Number(need()) || 0); break;
      case 'no-flush': if (raw !== undefined) throw new Error('--no-flush takes no value'); o.noFlush = true; break;
      case 'segmented': if (raw !== undefined) throw new Error('--segmented takes no value'); o.segmented = true; break;
      case 'scales': o.scales = list(need()).map(Number); break;
      case 'live-seconds': o.liveSeconds = Math.max(5, Number(need()) || 40); break;
      case 'tier': o.tier = need(); break;
      case 'profile': o.profileSeconds = Math.max(1, Number(raw ?? 4) || 4); break;
      case 'out': o.out = path.resolve(need()); break;
      case 'tag': o.tag = need(); break;
      case 'report': o.report = list(need()).map((r) => path.resolve(r)); break;
      case 'twin-tris-tol': o.twinTrisTol = Number(need()); break;
      case 'draws-tol': o.drawsTol = Number(need()); break;
      case 'stable-tol': o.stableTol = Number(need()); break;
      case 'scene-check': o.sceneCheck = need() !== 'off'; break;
      default: throw new Error(`Unknown argument --${name}`);
    }
  }
  if (o.report) return o;
  if (!o.roots?.length) throw new Error('--roots=<tree>[,<tree>...] is required');
  if (!o.maps?.length) throw new Error('--maps=<id>[,<id>...] is required');
  if (!o.labels) o.labels = o.roots.map((r) => path.basename(r));
  if (o.labels.length !== o.roots.length) throw new Error('--labels must match --roots');
  if (o.queries && o.queries.length !== o.roots.length) throw new Error('--queries must match --roots');
  if (!/^[A-Z]+$/.test(o.pattern)) throw new Error('--pattern is a string of A, B, ... letters');
  for (const ch of o.pattern) if (ch.charCodeAt(0) - 65 >= o.roots.length) throw new Error(`--pattern letter ${ch} has no root`);
  if (!/^\d+x\d+$/.test(o.sides)) throw new Error('--sides is <allies>x<enemies> (13x14 = the 14 v 14 preset)');
  for (const v of o.viewports) if (!/^\d+x\d+$/.test(v)) throw new Error(`--viewports entries are WxH, got ${v}`);
  for (const v of o.views) {
    const [base, speed] = v.split('@');
    if (speed !== undefined && !(Number(speed) > 0 && Number(speed) <= 30)) throw new Error(`a moving view is <view>@<m/s> (0..30], got ${v}`);
    if (!(base in HULL_RELATIVE_POSES)) selectMapViews([base]);
  }
  if (!['pinned', 'live'].includes(o.governor)) throw new Error('--governor is pinned or live');
  if (o.scales && (o.governor !== 'pinned' || o.scales.some((v) => !(v > 0 && v <= 1)))) throw new Error('--scales are pinned render scales in (0, 1]');
  if (o.toggle && !FRAME_PROBE_TOGGLES[o.toggle]) throw new Error(`--toggle must be one of ${Object.keys(FRAME_PROBE_TOGGLES).join(', ')}`);
  if (o.emulate && !MID_RANGE_PROXIES[o.emulate]) throw new Error(`--emulate must be one of ${Object.keys(MID_RANGE_PROXIES).join(', ')}`);
  // a map hold stages the default tank; a vehicle hold names its own and keeps the field as it is
  if (o.hideBots === 'auto') o.hideBots = o.spec === DEFAULTS.spec;
  if (!(o.port >= 1024 && o.port < 65536)) throw new Error('--port must be a TCP port');
  for (const k of ['twinTrisTol', 'drawsTol', 'stableTol']) if (!(o[k] >= 0)) throw new Error('--twin-tris-tol, --draws-tol and --stable-tol are percentages');
  if (!o.out) o.out = path.resolve('.qa-dev', 'reports', TOOL);
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(o.tag)) throw new Error('--tag must be a file-name token');
  return o;
}

/** The pinned opponents: every catalog id but the player, sorted, every k-th, `count` of them. */
export function pinnedOpponents(ids, playerSpecId, count) {
  const pool = [...new Set(ids)].filter((id) => id !== playerSpecId).sort();
  if (pool.length < count) throw new Error(`the catalog has ${pool.length} opponents for ${count} seats`);
  const stride = pool.length / count;
  const picked = [];
  for (let i = 0; i < count; i++) picked.push(pool[Math.floor(i * stride)]);
  return picked;
}

// ---------------------------------------------------------------------------------------------- page side

/** Before boot: long tasks, the preset (an explicit stored choice) and the sides switch. */
export function installObservers({ preset, allies, enemies }) {
  const tasks = [];
  window.__FBP = { tasks };
  try {
    window.localStorage.setItem('cot.gfxPreset', preset);
    window.localStorage.removeItem('cot.gfxAutoTier');
    const arrangement = { allies, enemies, waveSize: null, enemyNation: null };
    const all = {};
    for (const mode of ['standard', 'capture_the_flag', 'king_of_the_hill', 'turbo_ball', 'mars']) all[mode] = arrangement;
    window.localStorage.setItem('cot.game.teams.v1', JSON.stringify(all));
  } catch { /* storage blocked */ }
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) tasks.push({ t: +e.startTime.toFixed(1), ms: +e.duration.toFixed(1) });
    }).observe({ type: 'longtask', buffered: true });
  } catch { /* unsupported */ }
}

/** Freeze every bot and the player's inputs; pin (or release) the governor. */
export function freezeBattle(governor) {
  const D = window.__DEBUG;
  const roster = [];
  for (const e of D.game.tanks) {
    roster.push({ id: e.id, specId: e.specId, team: e.team, isPlayer: !!e.isPlayer });
    if (!e.isPlayer) e.aiCtl = null;
    if (e.input) { e.input.actionBits = 0; if ('throttle' in e.input) e.input.throttle = 0; if ('steer' in e.input) e.input.steer = 0; }
    if (e.state) e.state.speed = 0;
  }
  const P = D.post;
  try { P.resetPerfTrims?.(); } catch { /* optional */ }
  if (governor === 'pinned') {
    try { P.setAdaptiveSuspended?.(true); } catch { /* optional */ }
    try { P.pinDynScale?.(1); } catch { /* optional */ }
  } else {
    try { P.setAdaptiveSuspended?.(false); } catch { /* optional */ }
    try { P.pinDynScale?.(null); } catch { /* optional */ }
  }
  return { roster, dynScale: P.dynScale, perfTrim: P.perfTrim };
}

/**
 * --hide-bots: every vehicle but the player's out of the frame (root hidden, all its layers off); the count hidden.
 *
 * (2026-10-07, the whole-PR census) The hidden hulls also leave the near-vehicle shadow policy
 * (engine/nearVehicleShadowDetail.ts): it gives its four slots to the nearest scene-child hulls that are `visible` and carry
 * `userData.nearShadowDetail`, and battlePresentationRuntime sets every ally's root visible again each frame, so hidden allies
 * spawned nearer the camera took the slots and the player's hull cast through its convex proxies — on one build and not the
 * other wherever a layout moved the spawns (±16–19 shadow draws in the player's cascades). Clearing the hidden hulls' detail
 * record keeps the player in its slot on every build.
 */
export function hideOtherVehicles() {
  let hidden = 0;
  for (const e of window.__DEBUG.game.tanks) {
    const root = e.isPlayer ? null : e.visual?.root;
    if (!root) continue;
    root.visible = false;
    root.traverse((o) => o.layers.disableAll());
    if (root.userData) delete root.userData.nearShadowDetail;
    hidden++;
  }
  return hidden;
}

export async function awaitTextures(timeoutMs) {
  const state = window.__DEBUG.world?.minimapTextureState;
  if (!state?.promise) return { available: false };
  let timer;
  const started = performance.now();
  try {
    await Promise.race([state.promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), timeoutMs); })]);
  } catch { return { available: true, settled: !!state.settled, timedOut: true, waitedMs: Math.round(performance.now() - started) }; }
  finally { clearTimeout(timer); }
  return { available: true, settled: !!state.settled, waitedMs: Math.round(performance.now() - started) };
}

/**
 * A staged page's scene (page function): visible meshes, their instances and triangles (index or position count over
 * three, the draw range applied, times the instance count) by the scene's top two levels of groups — so a page that draws
 * more than its twin names the subtree that carries the extra draws.
 */
function sceneCensus() {
  const scene = window.__DEBUG?.scene;
  if (!scene) return null;
  const out = {};
  const name = (o) => (o.name || o.type || '?').slice(0, 48);
  const visit = (o, key) => {
    if (!o.visible) return;
    if (o.isMesh || o.isLine || o.isPoints || o.isSprite) {
      const g = o.geometry;
      const n = g ? (g.index ? g.index.count : (g.attributes?.position?.count ?? 0)) : 0;
      const dr = g?.drawRange, cnt = dr && Number.isFinite(dr.count) ? Math.min(dr.count, n) : n;
      const inst = o.isInstancedMesh ? o.count : 1;
      const e = out[key] ??= { meshes: 0, tris: 0, instances: 0 };
      e.meshes++; e.tris += Math.round(cnt / 3) * inst; e.instances += inst;
    }
    for (const c of o.children) visit(c, key);
  };
  for (const top of scene.children) {
    if (!top.visible) continue;
    if (top.children.length && !(top.isMesh || top.isLine || top.isPoints)) for (const c of top.children) visit(c, `${name(top)}/${name(c)}`);
    else visit(top, name(top));
  }
  return out;
}

/** Geometries the terrain LOD stream built while a sample ran (null when either reading is missing). */
export function streamedDuring(before, after) {
  const a = before?.terrainStreamed, b = after?.terrainStreamed;
  return Number.isFinite(a) && Number.isFinite(b) ? b - a : null;
}

/** Settle the terrain LOD stream at the current pose (a page without the API reports why instead of failing the slot). */
async function settleTerrainStream(page) {
  return page.evaluate(settleResidencyTerrain).catch((error) => ({ error: String(error?.message ?? error).slice(0, 200) }));
}

/** A summary's scene pass counts (the draws and triangles the agreement reads) and the frame's draws. */
const sceneOf = (summary) => (summary ? { calls: summary.passes?.scene?.calls?.med ?? null, tris: summary.passes?.scene?.tris?.med ?? null,
  all: summary.calls?.med ?? null } : null);

/** Percent difference of two counts against the smaller (Infinity when either is missing or zero). */
const pctOff = (a, b) => (a > 0 && b > 0 ? Math.abs(a - b) / Math.min(a, b) * 100 : Infinity);

/**
 * The pages' agreement. `pages` is [{ key, root, history: [{ calls, tris, seq? }, …] }] — every staging of a page, the
 * latest last (seq orders the stagings of one root across its pages). Twins (pages of one root) agree on triangles within
 * twinTris % and on draws within draws %; of two that do not, the one with more triangles is staged again (the over-drawn
 * state of holds 48 and 51 adds geometry). A page of another root than the base may differ from the base twins' median —
 * its own geometry — once the reading before it on its root (its own earlier staging, or another page of that root)
 * repeats its triangles within stable % and its draws within draws %; with no reading before it, it is staged again, or
 * waits when its root has stagings still to come (expectMore). A page still unsettled after maxReadings readings voids
 * the judgement. Returns { verdict: 'agree' | 'restage' | 'void', restage: [key], accepted: [{ key, trisPct, drawsPct }],
 * pending: [key], notes }.
 */
export function judgeScenes(pages, { twinTris = 3, draws = 25, stable = 1, maxReadings = 3, expectMore = [], baseRoot = pages[0]?.root } = {}) {
  const notes = [], restage = new Set(), accepted = [], pending = [];
  let voided = false;
  const last = (p) => p.history[p.history.length - 1] ?? {};
  const median = (xs) => {
    const v = xs.filter((x) => x > 0).sort((a, b) => a - b), m = v.length >> 1;
    return v.length ? (v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2) : null;
  };
  const live = pages.filter((p) => p.history.length);
  const byRoot = new Map();
  for (const p of live) byRoot.set(p.root, [...(byRoot.get(p.root) ?? []), p]);
  const unsettled = (p, why) => {
    if (p.history.length >= maxReadings) { voided = true; notes.push(`${p.key}: ${why} after ${p.history.length} reading(s) — void`); }
    else { restage.add(p.key); notes.push(`${p.key}: ${why} — staged again`); }
  };
  // 1. twins: every page of a root against the root's median
  for (const [root, group] of byRoot) {
    if (group.length < 2) continue;
    const mt = median(group.map((p) => last(p).tris)), mc = median(group.map((p) => last(p).calls));
    // (two twins pairwise — against their mean each would get half the gap; three or more against their median)
    const off = group.length === 2
      ? (pctOff(last(group[0]).tris, last(group[1]).tris) > twinTris || pctOff(last(group[0]).calls, last(group[1]).calls) > draws ? group : [])
      : group.filter((p) => pctOff(last(p).tris, mt) > twinTris || pctOff(last(p).calls, mc) > draws);
    if (!off.length) continue;
    if (group.length === 2) {
      const [x, y] = group;
      const worse = (last(x).tris ?? 0) !== (last(y).tris ?? 0) ? ((last(x).tris ?? 0) > (last(y).tris ?? 0) ? x : y)
        : ((last(x).calls ?? 0) >= (last(y).calls ?? 0) ? x : y);
      unsettled(worse, `twins of ${root === baseRoot ? 'the base' : 'one build'} disagree (${last(x).calls}/${last(y).calls} draws, `
        + `${last(x).tris}/${last(y).tris} triangles)`);
    } else for (const p of off) unsettled(p, `off its twins' median (${last(p).calls} draws against ${mc}, ${last(p).tris} triangles against ${mt})`);
  }
  // 2. another root's pages against the base twins' median: equal, or its own delta once a staging repeats it
  const base = byRoot.get(baseRoot) ?? [];
  const bt = median(base.map((p) => last(p).tris)), bc = median(base.map((p) => last(p).calls));
  const baseSettled = !voided && base.length > 0 && base.every((p) => !restage.has(p.key));
  for (const [root, group] of byRoot) {
    if (!baseSettled || root === baseRoot || group.some((p) => restage.has(p.key))) continue;
    const readings = group.flatMap((p) => p.history.map((h, i) => ({ ...h, key: p.key, order: h.seq ?? i }))).sort((a, b) => a.order - b.order);
    const latestKey = readings[readings.length - 1]?.key;
    for (const p of group) {
      const r = last(p), tp = pctOff(r.tris, bt), dp = pctOff(r.calls, bc);
      if (tp <= twinTris && dp <= draws) continue;
      // its root's stagings either side of it (a re-stage of the same page, or another page of the root): one that repeats
      // it makes the delta the build's own geometry
      const at = readings.findIndex((x) => x.key === p.key && x.order === (r.seq ?? p.history.length - 1));
      const near = [readings[at - 1], readings[at + 1]].filter(Boolean);
      const prev = near[0] ?? null;
      const twin = near.find((x) => pctOff(r.tris, x.tris) <= stable && pctOff(r.calls, x.calls) <= draws);
      if (twin) {
        accepted.push({ key: p.key, trisPct: +(((r.tris - bt) / bt) * 100).toFixed(2), drawsPct: +(((r.calls - bc) / bc) * 100).toFixed(2) });
        notes.push(`${p.key}: its own delta, repeated across a staging (${r.calls} draws, ${r.tris} triangles against the base's ${bc} / ${bt}) — accepted`);
      } else if (prev && p.key !== latestKey) notes.push(`${p.key}: not repeated by its root's next staging — that staging answers for the pair`);
      else if (prev) unsettled(p, `moved between stagings (${prev.calls} → ${r.calls} draws, ${prev.tris} → ${r.tris} triangles)`);
      else if (expectMore.includes(root)) { pending.push(p.key); notes.push(`${p.key}: off the base by ${tp.toFixed(1)} % triangles — its root's next staging must repeat it`); }
      else unsettled(p, `off the base by ${tp.toFixed(1)} % triangles / ${dp.toFixed(1)} % draws (its own geometry only if a re-stage repeats it)`);
    }
  }
  return { verdict: voided ? 'void' : restage.size ? 'restage' : 'agree', restage: [...restage], accepted, pending, notes };
}

/** The live graphics state a record is read against. */
function graphicsState() {
  const D = window.__DEBUG;
  const c = D.renderer.domElement;
  const t = D.lighting?.getShadowTelemetry?.();
  return {
    preset: D.quality?.resolvePresetName?.() ?? null,
    canvas: [c.width, c.height], renderScale: Number(c.dataset.renderScale) || null, dynScale: D.post.dynScale,
    perfTrim: D.post.perfTrim, postAa: c.dataset.postAa || null, lightFx: c.dataset.lightFx || null,
    shadowSizes: t ? t.cascades.map((x) => x.size) : null, shadowMaxFar: t?.maxFar ?? null,
    programs: D.renderer.info.programs?.length ?? null,
    // the terrain LOD stream's running count of streamed geometries (the sample's streamedDuring is its after − before)
    terrainStreamed: D.world?.group?.children?.find?.((c) => c.name === 'terrain')?.userData?.streamingStats?.streamedGeometryCount ?? null,
    // the static shadow-caster cache's running counts (null on a build without it): a sample's paths are the
    // difference of its graphics and graphicsAfter readings
    staticCache: t?.staticCache ? {
      reuses: (t.staticCache.reuses || []).reduce((a, v) => a + (v || 0), 0),
      rebuilds: (t.staticCache.rebuilds || []).reduce((a, v) => a + (v || 0), 0),
      unsettled: t.staticCache.unsettled ?? null, fullRenders: t.staticCache.fullRenders, contentChanges: t.staticCache.contentChanges,
      promoted: t.staticCache.promoted, lastRebuildReason: t.staticCache.lastRebuildReason, targetBytes: t.staticCache.targetBytes,
      hashMs: t.staticCache.hashMs, staticCasters: t.staticCache.staticCasters,
    } : null,
  };
}

/**
 * Mid-range emulation for a LIVE governor: a GPU-only burn (one fullscreen draw into a 64² target, a loop of
 * `iterations`) drawn right before the final pass — inside the governor's own GPU sample (post.ts opens it in
 * dynGovern and closes it after the upscaler) — so the governor sees the proxy's GPU time: real / ratio. The real
 * frame is the governor's sample minus the burn's known cost; the burn's cost per iteration is calibrated with the
 * probe's own query on frames where the governor's timer is paused (a pin at the current scale, released again;
 * every 4 s). The main thread is untouched, so a main-thread-bound frame stays one.
 */
function installGpuEmulator(ratio) {
  if (window.__FBP_EMULATOR) return window.__FBP_EMULATOR.state;
  const D = window.__DEBUG; const R = D.renderer; const gl = R.getContext(); const post = D.post;
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  if (!ext) return { ok: false, reason: 'no timer query' };
  const vs = '#version 300 es\nin vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }';
  const fs = '#version 300 es\nprecision highp float; uniform int uN; uniform float uS; out vec4 o;\n'
    + 'void main(){ vec2 v = gl_FragCoord.xy * 0.001 + uS; float a = 0.0; for (int i = 0; i < 200000; i++) { if (i >= uN) break; v = fract(v * 1.618 + vec2(0.13, 0.37)); a += v.x * v.y; } o = vec4(a * 1e-6); }';
  const compile = (type, src) => { const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh); return sh; };
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, vs)); gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return { ok: false, reason: gl.getProgramInfoLog(prog) };
  const buf = gl.createBuffer(); const vao = gl.createVertexArray(); const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 64, 64, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  R.resetState();
  const uN = gl.getUniformLocation(prog, 'uN'), uS = gl.getUniformLocation(prog, 'uS');
  const state = { ok: true, ratio, msPerIteration: 0, iterations: 0, realMs: 0, burnMs: 0, governorMs: null, calibrations: 0, frames: 0 };
  let calibrating = 0, calibrationQ = null, lastCalibrationAt = -1e9, pendingCalibration = null;
  const draw = (n, query) => {
    if (n <= 0 && !query) return;
    if (query) gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.viewport(0, 0, 64, 64);
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.SCISSOR_TEST);
    gl.useProgram(prog); gl.uniform1i(uN, Math.max(1, n)); gl.uniform1f(uS, (state.frames++ % 97) * 0.01);
    gl.bindVertexArray(vao); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.bindVertexArray(null);
    if (query) gl.endQuery(ext.TIME_ELAPSED_EXT);
    R.resetState(); // three cached the bindings this draw replaced
  };
  const upscaler = post.upscaler;
  const original = upscaler.render;
  upscaler.render = function (...args) {
    const now = performance.now();
    if (pendingCalibration && gl.getQueryParameter(pendingCalibration.q, gl.QUERY_RESULT_AVAILABLE)) {
      const ms = gl.getQueryParameter(pendingCalibration.q, gl.QUERY_RESULT) / 1e6; gl.deleteQuery(pendingCalibration.q);
      if (!gl.getParameter(ext.GPU_DISJOINT_EXT) && ms > 0) {
        const c = ms / pendingCalibration.n;
        state.msPerIteration = state.msPerIteration ? state.msPerIteration * 0.5 + c * 0.5 : c;
        state.calibrations++;
      }
      pendingCalibration = null;
    }
    if (!pendingCalibration && (now - lastCalibrationAt > 4000 || !state.msPerIteration) && !calibrating) {
      // pause the governor's timer for a frame (a pin at the current scale) and time the burn alone
      calibrating = 2; lastCalibrationAt = now;
      post.pinDynScale(post.dynScale);
    }
    if (calibrating === 1) {
      const n = state.iterations > 0 ? state.iterations : 4000;
      const q = gl.createQuery(); draw(n, q); pendingCalibration = { q, n };
    } else if (!calibrating) {
      // the governor's sample holds real + burn; the burn's own cost is known per iteration
      const governorMs = post.gpuFrameMs;
      if (governorMs !== null && state.msPerIteration > 0) {
        state.governorMs = governorMs;
        const real = Math.max(0.5, governorMs - state.burnMs);
        state.realMs = state.realMs ? state.realMs + (real - state.realMs) * 0.25 : real;
        const target = state.realMs * (1 / ratio - 1);
        state.iterations = Math.max(0, Math.min(200000, Math.round(target / state.msPerIteration)));
        state.burnMs = state.iterations * state.msPerIteration;
      }
      if (state.iterations > 0) draw(state.iterations, null);
    }
    if (calibrating) { calibrating--; if (!calibrating) post.pinDynScale(null); }
    return original.apply(this, args);
  };
  window.__FBP_EMULATOR = { state, uninstall() { upscaler.render = original; delete window.__FBP_EMULATOR; } };
  return state;
}

/**
 * A moving view (`<view>@<m/s>`): the pose glides along its own horizontal heading at the given speed, the camera and
 * its target each keeping their clearance over the ground, set just before every lighting update (so the cascades fit
 * the frame's camera). `restart()` returns it to the start of the path. Serialized into the page.
 */
function installMover(speed) {
  const D = window.__DEBUG; const V = D.camera.position.constructor; const hf = D.world.heightField;
  const look = D.camera.getWorldDirection(new V());
  const cam0 = D.camera.position.clone(); const at0 = cam0.clone().addScaledVector(look, 40);
  const dir = new V(look.x, 0, look.z).normalize();
  const camClear = cam0.y - hf.getHeightAt(cam0.x, cam0.z), atClear = at0.y - hf.getHeightAt(at0.x, at0.z);
  const fov = D.camera.fov; const c = new V(), a = new V();
  let t0 = null;
  const L = D.lighting; const original = L.update;
  L.update = function (...args) {
    if (t0 !== null) {
      const d = speed * (performance.now() - t0) / 1000;
      c.copy(cam0).addScaledVector(dir, d); c.y = hf.getHeightAt(c.x, c.z) + camClear;
      a.copy(at0).addScaledVector(dir, d); a.y = hf.getHeightAt(a.x, a.z) + atClear;
      D.rig.setExternalPose(c, a, fov);
    }
    return original.apply(this, args);
  };
  window.__FBP_MOVER = {
    restart() { t0 = performance.now(); },
    uninstall() { L.update = original; t0 = null; D.rig.setExternalPose(cam0, at0, fov); delete window.__FBP_MOVER; },
  };
  return { speed, camClear: +camClear.toFixed(2), heading: [+dir.x.toFixed(3), +dir.z.toFixed(3)] };
}

/** Chunk name of a script URL ('/assets/audioEngine-ab12cd34.js' → 'audioEngine'); V8's pseudo nodes keep their names. */
export function chunkOfUrl(url, functionName = '') {
  if (!url) return /^\(.*\)$/.test(functionName) ? functionName : '(native)';
  const base = url.split(/[?#]/)[0].split('/').pop() || url;
  return base.replace(/\.m?js$/, '').replace(/-[a-z0-9_]{6,}$/i, '');
}

/** Self time per chunk from a CDP profile (each sample charged the delta to the next one). */
export function profileSelfByChunk(profile) {
  const chunkOf = new Map();
  for (const node of profile.nodes) chunkOf.set(node.id, chunkOfUrl(node.callFrame?.url, node.callFrame?.functionName));
  const totals = new Map();
  const { samples = [], timeDeltas = [] } = profile;
  for (let i = 0; i < samples.length; i++) {
    const us = timeDeltas[i + 1] ?? 0;
    const chunk = chunkOf.get(samples[i]) ?? '(unknown)';
    totals.set(chunk, (totals.get(chunk) || 0) + us);
  }
  return [...totals].map(([chunk, us]) => ({ chunk, ms: +(us / 1000).toFixed(2) })).sort((a, b) => b.ms - a.ms);
}

async function profileMainThread(page, seconds) {
  const cdp = await page.target().createCDPSession();
  try {
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
    await page.evaluate(() => { window.__FBP_PROFILE_FRAMES = 0; const tick = () => { window.__FBP_PROFILE_FRAMES++; window.__FBP_PROFILE_RAF = requestAnimationFrame(tick); }; window.__FBP_PROFILE_RAF = requestAnimationFrame(tick); });
    await cdp.send('Profiler.start');
    await sleep(seconds * 1000);
    const { profile } = await cdp.send('Profiler.stop');
    const frames = await page.evaluate(() => { cancelAnimationFrame(window.__FBP_PROFILE_RAF); return window.__FBP_PROFILE_FRAMES; });
    const byChunk = profileSelfByChunk(profile);
    const perFrame = (ms) => (frames ? +(ms / frames).toFixed(3) : null);
    const audio = byChunk.filter((c) => /audio|sound|voice|vehicleRig|weaponAudio|mixer|procedural|ambience|crewRadio|sfx/i.test(c.chunk));
    const audioMs = audio.reduce((sum, c) => sum + c.ms, 0);
    return { seconds, frames, byChunk: byChunk.slice(0, 24).map((c) => ({ ...c, perFrameMs: perFrame(c.ms) })),
      audio: { chunks: audio.map((c) => c.chunk), ms: +audioMs.toFixed(2), perFrameMs: perFrame(audioMs) } };
  } finally {
    await cdp.send('Profiler.disable').catch(() => {});
    await cdp.detach().catch(() => {});
  }
}

// ---------------------------------------------------------------------------------------------- host side

function loadAverage() { return os.loadavg().map((v) => +v.toFixed(2)); }
/** CPU of other processes' GPU processes (headless Chrome, Playwright): the shared GPU's foreign load, by proxy. */
export function foreignGpuCpu() {
  try {
    const rows = execSync('ps -axo pid=,ppid=,pcpu=,command=', { encoding: 'utf8' }).split('\n');
    let sum = 0, n = 0;
    for (const row of rows) {
      const m = row.match(/^\s*(\d+)\s+(\d+)\s+([\d.]+)\s+(.*)$/);
      if (!m || !/--type=gpu-process/.test(m[4])) continue;
      if (Number(m[2]) === process.pid) continue;
      sum += Number(m[3]); n++;
    }
    return { cpu: +sum.toFixed(1), processes: n };
  } catch { return { cpu: -1, processes: -1 }; }
}

/** The FIFO, then (optionally) the session mutex — taken only while the FIFO is ours; a busy mutex returns the FIFO. */
export async function acquireProbeLocks({ sessionMutex = null, log = () => {}, fifoTimeoutMs = 3 * 60 * 60 * 1000,
  mutexWaitMs = 60_000, mutexIdleWaitMs = 45 * 60_000, lock = createCaptureLock(), tryMutex = defaultTryMutex,
  releaseMutex = defaultReleaseMutex, pause = sleep, mutexBusy = defaultMutexBusy, holderQueued = defaultHolderQueued } = {}) {
  // a lane hold (one ticket for several probe steps, tools/tmp-lane-hold.mjs) already holds the FIFO and the mutex for
  // the steps it spawns with COT_LANE_HOLD=1: they take nothing and release nothing
  if (process.env.COT_LANE_HOLD === '1') { log('the capture FIFO and the session mutex are the lane hold\'s'); return { round: 0, release: () => {}, refresh: () => {} }; }
  let ticket = null; // the first ticket: our place in the FIFO, kept across a turn given back
  for (let round = 1; ; round++) {
    await lock.acquire(fifoTimeoutMs, ticket ? { ticket } : {});
    ticket ??= lock.lastTicket ?? null;
    if (!sessionMutex) return { round, release: () => lock.release(), refresh: () => lock.refresh() };
    // a holder queued behind us cannot release while we hold the head: give the turn back at once; any other holder
    // (between its own captures) gets mutexWaitMs
    const queued = holderQueued(sessionMutex);
    const started = Date.now();
    for (;;) {
      if (tryMutex(sessionMutex)) {
        log(`capture FIFO and session mutex held (round ${round})`);
        return { round, refresh: () => lock.refresh(), release: () => { releaseMutex(sessionMutex); lock.release(); } };
      }
      if (queued || Date.now() - started >= mutexWaitMs) break;
      lock.refresh();
      await pause(500);
    }
    lock.release();
    log(`session mutex busy at the FIFO head (its holder ${queued ? 'is queued behind us' : `kept it ${Math.round(mutexWaitMs / 1000)} s`}): `
      + `turn given back; re-entering at our place once it is free (round ${round})`);
    // no ticket while the holder works, then our original ticket: the next head is not the same standoff, and the
    // turn given back costs one holder's batch, not the whole queue
    const waitFrom = Date.now();
    while (mutexBusy(sessionMutex) && Date.now() - waitFrom < mutexIdleWaitMs) await pause(5_000);
    await pause(2_000);
  }
}
function mutexOwner(dir) {
  try { return Number(readFileSync(path.join(dir, 'pid'), 'utf8').trim()) || null; } catch { return null; }
}
function defaultMutexBusy(dir) {
  const owner = mutexOwner(dir);
  if (!owner) return existsSync(dir);
  try { process.kill(owner, 0); return true; } catch { return false; } // a dead owner's mutex is stale
}
function defaultHolderQueued(dir) {
  const owner = mutexOwner(dir);
  if (!owner) return false;
  try { return readdirSync(CAPTURE_QUEUE_DIR).some((name) => name.endsWith(`-${owner}.t`)); } catch { return false; }
}
function defaultTryMutex(dir) {
  try { mkdirSync(dir); writeFileSync(path.join(dir, 'pid'), String(process.pid)); return true; } catch { return false; }
}
function defaultReleaseMutex(dir) {
  try {
    const owner = readFileSync(path.join(dir, 'pid'), 'utf8').trim();
    if (owner === String(process.pid)) rmSync(dir, { recursive: true, force: true });
  } catch { /* already gone */ }
}

export async function openPreview(root, port) {
  if (!existsSync(path.join(root, 'dist', 'index.html'))) throw new Error(`root ${root} has no dist/index.html (run npm run build there)`);
  const server = await preview({ root, configFile: false, logLevel: 'error', preview: { host: '127.0.0.1', port, strictPort: true } });
  return { close: () => server.close() };
}

export async function poseView(page, name) {
  if (name in HULL_RELATIVE_POSES) {
    return page.evaluate(`(() => {
      const resolveHullRelativePose = ${resolveHullRelativePose.toString()};
      const D = window.__DEBUG; const st = D.game.player.state; const V = D.camera.position.constructor;
      const pose = resolveHullRelativePose({ pos: st.pos, yaw: st.yaw }, ${JSON.stringify(name)}, ${JSON.stringify(HULL_RELATIVE_POSES)}, ${MAP_PROBE_FOV});
      D.rig.setExternalPose(new V(...pose.cam), new V(...pose.at), pose.fov);
      return { cam: pose.cam.map((v) => +v.toFixed(1)), at: pose.at.map((v) => +v.toFixed(1)) };
    })()`);
  }
  const pose = await applyGroundPose(page, selectMapViews([name])[0], { settleMs: 0 });
  return { cam: pose.cam.map((v) => +v.toFixed(1)), at: pose.at.map((v) => +v.toFixed(1)) };
}

export const grassSettled = () => {
  const g = window.__DEBUG.world?._tallGrass?.getState?.();
  return !g || !g.enabled || (!g.near.pending && !g.far.pending);
};

async function sampleView(page, options, { moving = false } = {}) {
  // segmented pieces over-count on ANGLE Metal (their command-buffer spans overlap: the pieces summed to 4-5x the
  // whole frame in the 2026-10-02 pilots), so they are a diagnostic only (--segmented); the per-pass split is the
  // prefix decomposition — one query per frame from its start to a rotating checkpoint
  // a live governor owns the TIME_ELAPSED target (post.ts samples every fourth frame): the probe keeps to the CPU
  const modesOf = () => (options.governor === 'live' ? ['cpu'] : options.segmented ? ['whole', 'segmented'] : ['whole']);
  const sample = async (frames, modes = modesOf(), checkpoints = undefined) => {
    // a moving view starts its path again for every sample, so each block of an A B B A covers the same ground
    if (moving) await page.evaluate(() => window.__FBP_MOVER.restart());
    return page.evaluate((cfg) => window.__FRAME_PASS_TIMER.sample(cfg),
      { frames, block: options.block, modes, flush: !options.noFlush, timeoutMs: Math.max(60000, frames * 400), ...(checkpoints ? { checkpoints } : {}) });
  };
  if (options.governor === 'live') {
    // the governor's own record: the scale it holds, its GPU sample, the presented cadence, every half second
    const series = await page.evaluate(async (seconds) => {
      const D = window.__DEBUG; const c = D.renderer.domElement; const out = [];
      const t0 = performance.now();
      while (performance.now() - t0 < seconds * 1000) {
        await new Promise((r) => setTimeout(r, 500));
        const e = window.__FBP_EMULATOR?.state;
        out.push({ t: +((performance.now() - t0) / 1000).toFixed(1), dynScale: D.post.dynScale, gpuMs: D.post.gpuFrameMs,
          frameEmaMs: Number(c.dataset.frameEmaMs) || null, fps: Number(c.dataset.fps) || null, renderScale: Number(c.dataset.renderScale) || null,
          emulatedRealMs: e ? +e.realMs.toFixed(2) : null, burnMs: e ? +e.burnMs.toFixed(2) : null });
      }
      return out;
    }, options.liveSeconds);
    const result = await sample(options.frames);
    return { result, series };
  }
  if (!options.toggle) {
    const result = await sample(options.frames);
    const prefix = options.prefixFrames > 0 ? await sample(options.prefixFrames, ['prefix']) : null;
    return { result, prefix };
  }
  const t = FRAME_PROBE_TOGGLES[options.toggle];
  const half = Math.max(30, Math.round(options.frames / 2));
  const blocks = [];
  let previous = 'on';
  for (const side of ['off', 'on', 'on', 'off']) {
    // (what the switch reports it did, kept with the block: a toggle that finds nothing to switch shows it here)
    const switched = await page.evaluate(t[side]);
    await sleep(side === 'on' && previous === 'off' && t.onSettleMs ? t.onSettleMs : 700);
    const state = await page.evaluate(() => {
      const w = window.__DEBUG.world; const g = w?._tallGrass?.pressure; const r = w?.group?.getObjectByName?.('terrain')?.userData?.waterRipples ?? null;
      const c = window.__DEBUG.lighting?.getShadowTelemetry?.().staticCache;
      return { pressureSkipped: g?.skippedFrames ?? null, pressureSteps: g?.steps ?? null, rippleAsleep: r?.asleep ?? null,
        cacheReuses: c ? (c.reuses || []).reduce((a, v) => a + (v || 0), 0) : null, cacheRebuilds: c ? (c.rebuilds || []).reduce((a, v) => a + (v || 0), 0) : null };
    });
    // a toggle block's frames rotate through a few prefix checkpoints: the simulations' step, the shadow maps' step,
    // the scene's and the whole frame (the last checkpoint), each from the same block of one pose; the static shadow
    // cache's own record of the block beside them (cacheTrace: its rebuilds, reuses and copies frame by frame)
    await page.evaluate(cacheTrace, 'start');
    const result = await sample(half, ['prefix'], TOGGLE_CHECKPOINTS);
    const cache = await page.evaluate(cacheTrace, 'stop');
    blocks.push({ side, state, switched: switched ?? null, result, cache });
    previous = side;
  }
  await page.evaluate(t.on);
  return { toggle: options.toggle, blocks };
}

/**
 * The static shadow cache's record of a sample (engine/shadowStaticCache.ts telemetry, read every frame from rAF; the
 * 2026-10-08 cache question): per cascade the rebuilds and the reuses, the ordinary renders (and those of a cascade whose
 * pose had not settled), the copies, the content changes and promotions, the rebuilds by the reason the frame's last one
 * gave, the hash's time, and the first frames as a pattern (R a rebuild, . reuses only, u reuses beside ordinary renders,
 * f ordinary renders only, - no cascade rendered). Serialized into the page: 'start' arms it, 'stop' returns the record.
 */
export function cacheTrace(cmd) {
  const tel = () => window.__DEBUG.lighting?.getShadowTelemetry?.()?.staticCache ?? null;
  let T = window.__FBP_CACHE_TRACE;
  if (!T) {
    T = window.__FBP_CACHE_TRACE = { active: false, last: null, frames: [] };
    const step = () => {
      if (T.active) {
        const t = tel();
        if (t && T.last) {
          const n = Math.max(t.rebuilds.length, t.reuses.length, T.last.rebuilds.length, T.last.reuses.length);
          const rb = [], ru = [];
          for (let i = 0; i < n; i++) {
            rb.push((t.rebuilds[i] || 0) - (T.last.rebuilds[i] || 0));
            ru.push((t.reuses[i] || 0) - (T.last.reuses[i] || 0));
          }
          T.frames.push({ rb, ru, copies: t.copies - T.last.copies, full: t.fullRenders - T.last.fullRenders,
            unsettled: t.unsettled - T.last.unsettled, content: t.contentChanges - T.last.contentChanges,
            promotions: t.promotions - T.last.promotions, demotions: t.demotions - T.last.demotions,
            reason: t.lastRebuildReason, hashMs: t.hashMs });
        }
        T.last = t;
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  if (cmd === 'start') { T.frames = []; T.last = tel(); T.active = true; return T.last ? { enabled: T.last.enabled } : null; }
  T.active = false;
  const end = tel();
  if (!end) return null;
  const f = T.frames;
  const total = (xs) => xs.reduce((a, v) => a + v, 0);
  const sum = (get) => f.reduce((a, x) => a + get(x), 0);
  const cascades = f.reduce((m, x) => Math.max(m, x.rb.length), 0);
  const perCascade = [];
  for (let i = 0; i < cascades; i++) perCascade.push({ rebuilds: sum((x) => x.rb[i] || 0), reuses: sum((x) => x.ru[i] || 0) });
  const reasons = {};
  for (const x of f) {
    const r = total(x.rb);
    if (r > 0) reasons[x.reason || '?'] = (reasons[x.reason || '?'] || 0) + r;
  }
  const hash = f.map((x) => x.hashMs).filter(Number.isFinite).sort((a, b) => a - b);
  const pattern = f.slice(0, 60).map((x) => {
    const r = total(x.rb), u = total(x.ru);
    return r ? 'R' : u ? (x.full ? 'u' : '.') : x.full ? 'f' : '-';
  }).join('');
  return {
    frames: f.length, enabled: end.enabled, failed: end.failed, perCascade,
    rebuilds: sum((x) => total(x.rb)), reuses: sum((x) => total(x.ru)), full: sum((x) => x.full), unsettled: sum((x) => x.unsettled),
    copies: sum((x) => x.copies), contentChanges: sum((x) => x.content), promotions: sum((x) => x.promotions),
    demotions: sum((x) => x.demotions), promoted: end.promoted, staticCasters: end.staticCasters, reasons,
    hashMsMed: hash.length ? hash[Math.floor((hash.length - 1) / 2)] : null, pattern, targetBytes: end.targetBytes,
  };
}

/** A slot the pages' agreement sends back to be staged again before it measures. */
class RestageSignal extends Error {}

async function measureSlot(browser, options, slot, gate = null) {
  const [w0, h0] = options.viewports[0].split('x').map(Number);
  const [allies, enemies] = options.sides.split('x').map(Number);
  for (;;) {
    const page = await browser.newPage();
    try {
      return await measureOnPage(page, options, slot, { w0, h0, allies, enemies }, gate);
    } catch (error) {
      if (!(error instanceof RestageSignal)) throw error;
    } finally {
      await page.close().catch(() => {});
    }
  }
}

async function measureOnPage(page, options, slot, { w0, h0, allies, enemies }, gate = null) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error?.message ?? error).slice(0, 400)));
  await page.setViewport({ width: w0, height: h0, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(installObservers, { preset: options.preset, allies, enemies });
  const gotoAt = Date.now();
  const query = [`nosplash=1`, `tier=${options.tier}`, slot.query].filter(Boolean).join('&');
  await page.goto(`http://127.0.0.1:${options.port}/?${query}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 300000 });
  const readyMs = Date.now() - gotoAt;
  const catalog = await page.evaluate(() => window.__DEBUG.game.allTanks.map((e) => e.specId));
  const opponents = pinnedOpponents(catalog, options.spec, allies + enemies);
  await page.evaluate((ids) => { const f = window.__DEBUG.flags; f.forceRoster = ids; f.rosterExact = true; }, opponents);
  const entryAt = Date.now();
  await beginSoloBattle(page, { specId: options.spec, mapId: slot.mapId, timeoutMs: 420000 });
  const entryMs = Date.now() - entryAt;
  const textures = await page.evaluate(awaitTextures, 90000);
  const frozen = await page.evaluate(freezeBattle, options.governor);
  const hiddenBots = options.hideBots ? await page.evaluate(hideOtherVehicles) : 0;
  if (options.hideBots) console.log(`[${TOOL} ${new Date().toISOString().slice(11, 19)}] ${slot.key}: ${hiddenBots} bot vehicle(s) hidden (--hide-bots)`);
  await page.waitForFunction(grassSettled, { timeout: 30000, polling: 250 }).catch(() => {});
  const timer = await page.evaluate(installFramePassTimer);
  let emulator = null;
  if (options.emulate) emulator = await page.evaluate(installGpuEmulator, proxyRatios(MID_RANGE_PROXIES[options.emulate]).gpuRatio);
  await sleep(options.settleMs);
  // the pages' agreement: the scene at the first pose — 30 whole frames' scene draws and triangles and the census —
  // judged against the slots before this one; a slot sent back is staged again on a new page, a void one never measures
  let staged = null;
  if (gate) {
    await poseView(page, options.views[0].split('@')[0]);
    await sleep(1200);
    await page.waitForFunction(grassSettled, { timeout: 20000, polling: 250 }).catch(() => {});
    await settleTerrainStream(page);
    const read = await page.evaluate((cfg) => window.__FRAME_PASS_TIMER.sample(cfg),
      { frames: 30, block: options.block, modes: ['whole'], flush: !options.noFlush, timeoutMs: 60000 });
    staged = { ...sceneOf(summarizePassFrames(read)), census: await page.evaluate(sceneCensus).catch(() => null) };
    const verdict = await gate(staged);
    if (verdict.action === 'restage') throw new RestageSignal(verdict.note);
    if (verdict.action === 'void') {
      return { mapId: slot.mapId, readyMs, entryMs, void: `pages disagree: ${verdict.note}`, scene: staged, samples: [], pageErrors: errors };
    }
    staged.accepted = verdict.accepted ?? [];
  }
  const samples = [];
  for (const viewport of options.viewports) {
    const [w, h] = viewport.split('x').map(Number);
    if (w !== page.viewport().width || h !== page.viewport().height) {
      await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
      await sleep(1500);
    }
    for (const view of options.views) {
      const [viewName, speedText] = view.split('@');
      const pose = await poseView(page, viewName);
      const moving = speedText !== undefined;
      if (moving) pose.mover = await page.evaluate(installMover, Number(speedText));
      await sleep(1200);
      await page.waitForFunction(grassSettled, { timeout: 20000, polling: 250 }).catch(() => {});
      const terrainSettle = moving ? null : await settleTerrainStream(page);
      if (options.governor === 'live') await sleep(Math.max(0, options.settleMs * 3)); // let the governor walk
      for (const scale of options.scales ?? [null]) {
        if (scale !== null) { await page.evaluate((v) => window.__DEBUG.post.pinDynScale(v), scale); await sleep(1200); }
        await sleep(options.settleMs);
        const graphics = await page.evaluate(graphicsState);
        const measured = await sampleView(page, options, { moving });
        const after = await page.evaluate(graphicsState);
        const suffix = scale === null ? '' : `-s${Math.round(scale * 100)}`;
        if (options.shots) {
          const stem = path.join(options.out, `${options.tag}-${slot.key}-${viewport}-${view}${suffix}`);
          await page.screenshot({ path: `${stem}.png` });
          // the pose once more as luminance, rendered and read in one task (tools/frame-capture-compare.mjs)
          writeFileSync(`${stem}.lum`, encodeLum(await page.evaluate(captureLuminance)));
        }
        const emulation = options.emulate ? await page.evaluate(() => ({ ...window.__FBP_EMULATOR?.state })) : null;
        samples.push({ viewport, view: `${view}${suffix}`, scale, pose, graphics, graphicsAfter: after, emulation, terrainSettle,
          streamedDuring: streamedDuring(graphics, after), ...measured });
      }
      if (moving) await page.evaluate(() => window.__FBP_MOVER.uninstall());
      if (options.scales) await page.evaluate(() => window.__DEBUG.post.pinDynScale(1));
    }
  }
  // --profile[=s]: a CDP CPU profile of the main thread at the first pose, self time grouped by chunk (the audio
  // engine, the world, three, the entry...), per presented frame — attribution for what no timer label covers
  let cpuProfile = null;
  if (options.profileSeconds) {
    await poseView(page, options.views[0].split('@')[0]);
    await sleep(1500);
    cpuProfile = await profileMainThread(page, options.profileSeconds);
  }
  const memory = await page.evaluate(() => {
    const R = window.__DEBUG.renderer;
    return { geometries: R.info.memory.geometries, textures: R.info.memory.textures, programs: R.info.programs?.length ?? null,
      heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null };
  });
  const tasks = await page.evaluate(() => window.__FBP.tasks);
  // the scenery lane (wave 74): the rocks' repartition passes (props.ts rockLodTrace, the last 64), so a moving view's
  // long tasks can be lined up with them
  const rockLod = await page.evaluate(() => {
    const trace = window.__DEBUG.scene.getObjectByName('props')?.userData?.rockLodTrace;
    if (!trace) return null;
    const passes = [];
    for (let k = Math.max(0, trace.n - 64); k < trace.n; k++) passes.push({ t: +trace.at[k % 64].toFixed(1), ms: +trace.ms[k % 64].toFixed(3) });
    return { total: trace.n, passes };
  });
  return { mapId: slot.mapId, readyMs, entryMs, textures, timer, emulator, scene: staged, frozen: { dynScale: frozen.dynScale, perfTrim: frozen.perfTrim },
    bots: { hidden: !!options.hideBots, count: hiddenBots },
    roster: { count: frozen.roster.length, player: frozen.roster.find((r) => r.isPlayer)?.specId ?? null,
      opponents, teams: frozen.roster.reduce((a, r) => { a[r.team] = (a[r.team] || 0) + 1; return a; }, {}) },
    samples, cpuProfile, memory, longTasks: { total: tasks.length, over100: tasks.filter((t) => t.ms >= 100).length, max: tasks.reduce((m, t) => Math.max(m, t.ms), 0),
      list: tasks.slice(-300) }, rockLod,
    pageErrors: errors };
}

async function run(options) {
  mkdirSync(options.out, { recursive: true });
  const log = (line) => console.log(`[${TOOL} ${new Date().toISOString().slice(11, 19)}] ${line}`);
  const slotFile = (key) => path.join(options.out, `${options.tag}-${key}.json`);
  const slotsFor = (mapId) => [...options.pattern].map((ch, i) => {
    const r = ch.charCodeAt(0) - 65;
    return { mapId, root: options.roots[r], label: options.labels[r], query: options.queries?.[r] || '', key: `${mapId}-s${i}-${options.labels[r]}` };
  });
  const todo = options.maps.flatMap(slotsFor).filter((s) => {
    try { return !!JSON.parse(readFileSync(slotFile(s.key), 'utf8')).failed; } catch { return true; }
  });
  if (!todo.length) { log('every slot is already measured'); return { ok: true, remaining: 0 }; }
  const locks = await acquireProbeLocks({ sessionMutex: options.sessionMutex, log });
  const refresh = setInterval(() => locks.refresh(), 30000);
  refresh.unref();
  const machine = { cores: os.cpus().length, loadStart: loadAverage(), samples: [] };
  const sampler = setInterval(() => machine.samples.push({ at: new Date().toISOString(), load1: +os.loadavg()[0].toFixed(2), foreignGpu: foreignGpuCpu() }), 15000);
  const started = Date.now();
  let browser = null, server = null, serving = null, ok = true, remaining = 0, voided = 0;
  // the pages' agreement: every staging's scene reading per slot (a resumed slot's from its record), judged per map in
  // pattern order with the pattern's first root as the base
  const sceneOpts = { twin: options.twinTrisTol, draws: options.drawsTol, stable: options.stableTol };
  const staging = new Map();
  let seq = 0;
  for (const s of options.maps.flatMap(slotsFor)) {
    try {
      const prior = JSON.parse(readFileSync(slotFile(s.key), 'utf8'));
      if (!prior.failed && prior.scene?.tris) staging.set(s.key, { key: s.key, root: s.root, history: [{ calls: prior.scene.calls, tris: prior.scene.tris, seq: seq++ }] });
    } catch { /* not measured yet */ }
  }
  const revisit = new Set();
  const gateFor = (slot, queue, qi) => async (reading) => {
    const entry = staging.get(slot.key) ?? { key: slot.key, root: slot.root, history: [] };
    staging.set(slot.key, entry);
    entry.history.push({ calls: reading.calls, tris: reading.tris, seq: seq++ });
    const mapSlots = slotsFor(slot.mapId);
    const pagesNow = mapSlots.map((s) => staging.get(s.key)).filter(Boolean);
    const later = queue.slice(qi + 1).filter((s) => s.mapId === slot.mapId).map((s) => s.root);
    const j = judgeScenes(pagesNow, { twinTris: sceneOpts.twin, draws: sceneOpts.draws, stable: sceneOpts.stable,
      expectMore: later, baseRoot: mapSlots[0].root });
    log(`${slot.key} scene ${reading.calls} draws / ${reading.tris} triangles — ${j.verdict}${j.notes.length ? `: ${j.notes.join('; ')}` : ''}`);
    // an earlier slot the judgement sends back measures again at the end of the run (its record is set aside now)
    for (const k of j.restage) {
      if (k === slot.key) continue;
      const earlier = mapSlots.find((s) => s.key === k);
      try {
        const rec = JSON.parse(readFileSync(slotFile(k), 'utf8'));
        writeFileSync(slotFile(k), JSON.stringify({ ...rec, failed: `scene: staged again after ${slot.key} (${j.notes.join('; ')})` }, null, 1));
      } catch { /* not on disk */ }
      if (earlier) revisit.add(earlier);
    }
    if (j.verdict === 'void') return { action: 'void', note: j.notes.join('; ') };
    if (j.restage.includes(slot.key)) return { action: 'restage', note: j.notes.join('; ') };
    return { action: 'measure', accepted: j.accepted };
  };
  try {
    browser = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000,
      args: [...MAP_PROBE_BROWSER_ARGS, '--enable-precise-memory-info', '--window-size=1920,1080'] });
    const queue = [...todo];
    let revisited = false;
    for (let qi = 0; qi < queue.length; qi++) {
      const slot = queue[qi];
      try {
        if (options.budgetMin && (Date.now() - started) / 60000 > options.budgetMin) { remaining++; continue; }
        if (serving !== slot.root) {
          if (server) await server.close();
          server = await openPreview(slot.root, options.port);
          serving = slot.root;
        }
        const loadBefore = +os.loadavg()[0].toFixed(2), foreignBefore = foreignGpuCpu(), slotStarted = Date.now();
        let record;
        try {
          record = await measureSlot(browser, options, slot, options.sceneCheck ? gateFor(slot, queue, qi) : null);
          record.label = slot.label; record.key = slot.key; record.root = slot.root; record.query = slot.query;
          record.load1 = { before: loadBefore, after: +os.loadavg()[0].toFixed(2) };
          record.foreignGpu = { before: foreignBefore, after: foreignGpuCpu() };
          if (record.void) {
            voided++;
            log(`${slot.key} VOID: ${record.void}`);
            writeFileSync(slotFile(slot.key), JSON.stringify(record, null, 1));
            continue;
          }
          for (const s of record.samples) {
            if (s.result) s.summary = summarizePassFrames(s.result);
            if (s.prefix) s.prefixSummary = summarizePassFrames(s.prefix);
            for (const b of s.blocks ?? []) b.summary = summarizePassFrames(b.result);
            // the draws and triangles of every measured sample (and toggle block): the agreement's per-cycle record
            s.scene = sceneOf(s.summary);
            for (const b of s.blocks ?? []) b.scene = sceneOf(b.summary);
          }
          const first = record.samples[0];
          const sm = first.summary ?? first.blocks?.[1]?.summary;
          // a slot whose first measured pose left its staged reading (triangles past the twins' tolerance, draws past their
          // wander) is void: its scene changed between the gate and the measurement
          // (a still pose of the whole frame only: a moving view or a toggle's blocks change their own counts)
          const fs = first.scene ?? sceneOf(sm);
          const still = !first.blocks?.length && !String(first.view).includes('@');
          if (still && record.scene?.tris && fs && (pctOff(fs.tris, record.scene.tris) > options.twinTrisTol || pctOff(fs.calls, record.scene.calls) > options.drawsTol)) {
            record.void = `the scene changed mid-run: ${fs.calls} draws / ${fs.tris} triangles measured against ${record.scene.calls} / ${record.scene.tris} staged`;
            voided++;
          }
          log(`${slot.key} ${first.viewport} ${first.view}: gpu ${sm?.gpuFrame.med} ms (pieces ${sm?.gpuSegmentedSum.med}, ratio ${sm?.segmentedOverWhole}) cpu ${sm?.cpuFrame.med} calls ${sm?.calls.med} scene ${fs?.calls} draws / ${fs?.tris} tris | entry ${Math.round(record.entryMs / 1000)} s | load ${loadBefore} fgGPU ${foreignBefore.cpu}% | ${Math.round((Date.now() - slotStarted) / 1000)} s${record.pageErrors.length ? ` (page errors ${record.pageErrors.length})` : ''}${record.void ? ` VOID: ${record.void}` : ''}`);
        } catch (error) {
          ok = false;
          record = { failed: String(error?.stack || error).slice(0, 2000), key: slot.key, label: slot.label, mapId: slot.mapId };
          log(`${slot.key} FAILED: ${String(error?.message || error).slice(0, 400)}`);
        }
        writeFileSync(slotFile(slot.key), JSON.stringify(record, null, 1));
      } finally {
        // the slots the agreement sent back measure once more after the pattern, each judged again against the others
        if (qi === queue.length - 1 && revisit.size && !revisited) { revisited = true; queue.push(...revisit); revisit.clear(); }
      }
    }
  } finally {
    clearInterval(sampler);
    clearInterval(refresh);
    if (browser) await browser.close().catch(() => {});
    if (server) await server.close().catch(() => {});
    locks.release();
  }
  machine.loadEnd = loadAverage();
  // the slots the agreement set aside and the budget left unmeasured are the next hold's (their records say failed)
  remaining += revisit.size;
  writeFileSync(path.join(options.out, `${options.tag}.receipt.json`), JSON.stringify({ tool: TOOL, protocol: FRAME_PASS_TIMER_PROTOCOL,
    writtenAt: new Date().toISOString(), options, machine, remaining, voided,
    scenes: Object.fromEntries([...staging].map(([k, v]) => [k, v.history])), node: process.version }, null, 1));
  log(`${ok ? 'done' : 'FAILED'}${remaining ? ` (${remaining} slot(s) left for the next hold)` : ''}${voided ? ` — ${voided} slot(s) VOID` : ''}`);
  if (ok && remaining) process.exitCode = 3;
  return { ok, remaining };
}

// ---------------------------------------------------------------------------------------------- report

/** Read every slot record of the given directories. */
function readSlotRecords(dirs) {
  const records = [];
  for (const dir of dirs) {
    for (const name of readdirSync(dir).filter((n) => n.endsWith('.json') && !n.endsWith('.receipt.json')).sort()) {
      try {
        const record = JSON.parse(readFileSync(path.join(dir, name), 'utf8'));
        if (record && !record.failed && Array.isArray(record.samples)) records.push(record);
      } catch { /* not a slot record */ }
    }
  }
  return records;
}

/** Slot order inside a map's pattern (the key's s<i>). */
const slotIndex = (record) => Number(/-s(\d+)-/.exec(record.key)?.[1] ?? 0);

/** The static shadow cache's records of a side's blocks (cacheTrace), per frame: what it rebuilt, reused and copied. */
export function cacheOfUnits(units) {
  const records = units.map((u) => u.cache).filter((c) => c && c.frames > 0);
  if (!records.length) return null;
  const frames = records.reduce((a, c) => a + c.frames, 0);
  const per = (k) => +(records.reduce((a, c) => a + (c[k] || 0), 0) / frames).toFixed(3);
  const reasons = {};
  for (const c of records) for (const [k, v] of Object.entries(c.reasons || {})) reasons[k] = (reasons[k] || 0) + v;
  const hash = records.map((c) => c.hashMsMed).filter(Number.isFinite).sort((a, b) => a - b);
  return { frames, enabled: records.some((c) => c.enabled), rebuilds: per('rebuilds'), reuses: per('reuses'), full: per('full'),
    unsettled: per('unsettled'), copies: per('copies'), contentChanges: per('contentChanges'), promotions: per('promotions'), reasons,
    hashMs: hash.length ? hash[Math.floor((hash.length - 1) / 2)] : null, patterns: records.map((c) => c.pattern) };
}

/**
 * One table per map × viewport × view (and per toggle): per step the median GPU ms of each label (median over that
 * label's slots or blocks) from the prefix decomposition, the CPU ms and draw calls of the labels the step covers, and
 * for two labels the A B B A pair deltas with their spread; frame totals (the whole-frame query), CPU, draws.
 */
export function buildFrameReport(records, labels = null, sceneTolerances = {}) {
  const out = {};
  const median = (xs) => { const v = xs.filter((x) => x !== null && x !== undefined && Number.isFinite(x)).sort((a, b) => a - b); return v.length ? +v[Math.floor((v.length - 1) / 2)].toFixed(2) : null; };
  const sumLabels = (summary, names, field) => {
    let total = 0, any = false;
    for (const n of names) { const v = summary?.passes?.[n]?.[field]?.med; if (v !== null && v !== undefined) { total += v; any = true; } }
    return any ? +total.toFixed(3) : null;
  };
  /** One measured unit (a slot's pose, or a toggle block): GPU per step, CPU and draws per step, frame totals. */
  const unitOf = (summary, prefixSummary) => {
    const steps = {};
    const prefix = prefixSummary?.prefixPasses ?? summary?.prefixPasses ?? {};
    const stepNames = Object.keys(prefix);
    for (const step of stepNames) {
      const names = STEP_LABELS[step] ?? [step];
      steps[step] = { gpu: prefix[step]?.med ?? null, gpuP25: prefix[step]?.p25 ?? null,
        cpu: sumLabels(summary, names, 'cpu'), calls: sumLabels(summary, names, 'calls') };
    }
    return { steps, gpuFrame: summary?.gpuFrame?.med ?? null, gpuFrameP25: summary?.gpuFrame?.p25 ?? null,
      cpuFrame: summary?.cpuFrame?.med ?? null, calls: summary?.calls?.med ?? null, tris: summary?.tris?.med ?? null,
      interval: summary?.interval?.med ?? null };
  };
  // a slot the agreement voided before it measured (no samples) voids every row of its map
  const mapVoids = {};
  for (const r of records) if (r.void && !r.samples?.length) (mapVoids[r.mapId] ||= []).push(`${r.key ?? r.label}: ${r.void}`);
  for (const r of records) {
    for (const s of r.samples) {
      if (s.blocks?.length) {
        const k = `${r.mapId} ${s.viewport} ${s.view} toggle:${s.toggle ?? r.toggle ?? '?'}`;
        const row = (out[k] ||= { mapId: r.mapId, viewport: s.viewport, view: s.view, toggle: s.toggle ?? null, units: [] });
        s.blocks.forEach((b, i) => { if (b.summary) row.units.push({ label: b.side, order: slotIndex(r) * 10 + i, unit: unitOf(b.summary, b.summary), state: b.state, cache: b.cache ?? null }); });
        continue;
      }
      if (!s.summary) continue;
      const k = `${r.mapId} ${s.viewport} ${s.view}`;
      (out[k] ||= { mapId: r.mapId, viewport: s.viewport, view: s.view, units: [] }).units.push({ label: r.label, order: slotIndex(r),
        unit: unitOf(s.summary, s.prefixSummary), load1: r.load1, foreignGpu: r.foreignGpu, scene: s.scene ?? sceneOf(s.summary), void: r.void ?? null });
    }
  }
  for (const row of Object.values(out)) {
    row.units.sort((a, b) => a.order - b.order);
    const present = row.toggle ? ['off', 'on'] : (labels ?? [...new Set(row.units.map((u) => u.label))]);
    // the pages' agreement at this pose (the slots of one label are twins; another label's delta must repeat across its
    // slots): a row whose slots disagree, or with a void slot, is VOID — its deltas compare different scenes
    if (!row.toggle) {
      const voids = [...(mapVoids[row.mapId] ?? []), ...row.units.filter((u) => u.void).map((u) => `${u.label} s${u.order}: ${u.void}`)];
      const counted = row.units.filter((u) => u.scene?.tris);
      if (counted.length === row.units.length && counted.length > 1) {
        const j = judgeScenes(counted.map((u) => ({ key: `${u.label} s${u.order}`, root: u.label, history: [{ calls: u.scene.calls, tris: u.scene.tris, seq: u.order }] })),
          { maxReadings: 1, baseRoot: present[0], ...sceneTolerances });
        row.scene = { verdict: j.verdict, accepted: j.accepted, notes: j.notes };
        if (j.verdict !== 'agree') voids.push(...j.notes);
      }
      if (voids.length) row.void = voids;
    }
    const stepNames = [...new Set(row.units.flatMap((u) => Object.keys(u.unit.steps)))];
    row.stepNames = stepNames;
    row.byLabel = {};
    for (const label of present) {
      const units = row.units.filter((u) => u.label === label).map((u) => u.unit);
      row.byLabel[label] = {
        n: units.length,
        gpuFrame: median(units.map((u) => u.gpuFrame)), gpuFrameP25: median(units.map((u) => u.gpuFrameP25)),
        cpuFrame: median(units.map((u) => u.cpuFrame)), calls: median(units.map((u) => u.calls)), tris: median(units.map((u) => u.tris)),
        interval: median(units.map((u) => u.interval)),
        cache: cacheOfUnits(row.units.filter((u) => u.label === label)),
        steps: Object.fromEntries(stepNames.map((p) => [p, {
          gpu: median(units.map((u) => u.steps[p]?.gpu)), cpu: median(units.map((u) => u.steps[p]?.cpu)), calls: median(units.map((u) => u.steps[p]?.calls)),
        }])),
      };
    }
    if (present.length === 2) {
      const [a, b] = present;
      const seq = (get) => row.units.map((u) => ({ label: u.label, value: get(u.unit) }));
      row.deltas = {
        gpuFrame: pairDeltas(seq((u) => u.gpuFrame), a, b), gpuFrameP25: pairDeltas(seq((u) => u.gpuFrameP25), a, b),
        cpuFrame: pairDeltas(seq((u) => u.cpuFrame), a, b), calls: pairDeltas(seq((u) => u.calls), a, b),
        interval: pairDeltas(seq((u) => u.interval), a, b),
        steps: Object.fromEntries(stepNames.map((p) => [p, {
          gpu: pairDeltas(seq((u) => u.steps[p]?.gpu ?? null), a, b), cpu: pairDeltas(seq((u) => u.steps[p]?.cpu ?? null), a, b),
          calls: pairDeltas(seq((u) => u.steps[p]?.calls ?? null), a, b),
        }])),
      };
    }
  }
  return out;
}

/** Per map and label: the median per-frame self time of every chunk across the slots' CPU profiles (--profile). */
export function buildProfileReport(records) {
  const out = {};
  const median = (xs) => { const v = xs.filter(Number.isFinite).sort((p, q) => p - q); return v.length ? +v[Math.floor((v.length - 1) / 2)].toFixed(3) : null; };
  for (const r of records) {
    if (!r.cpuProfile?.byChunk) continue;
    const row = ((out[r.mapId] ||= {})[r.label] ||= { slots: 0, chunks: {}, audio: [] });
    row.slots++;
    for (const c of r.cpuProfile.byChunk) (row.chunks[c.chunk] ||= []).push(c.perFrameMs);
    row.audio.push(r.cpuProfile.audio?.perFrameMs ?? 0);
  }
  for (const labels of Object.values(out)) {
    for (const row of Object.values(labels)) {
      row.chunks = Object.fromEntries(Object.entries(row.chunks).map(([k, v]) => [k, median(v)]).sort((x, y) => y[1] - x[1]));
      row.audio = median(row.audio);
    }
  }
  return out;
}

/** Markdown for a report: one table per map × viewport × view (and toggle). */
function formatFrameReport(report, { proxy = 'rtx4050-laptop' } = {}) {
  const ratios = proxyRatios(MID_RANGE_PROXIES[proxy]);
  const lines = [];
  const delta = (d) => (d && d.pairs ? `${d.med} [${d.min}..${d.max}]` : '');
  for (const row of Object.values(report)) {
    const labels = Object.keys(row.byLabel);
    lines.push(`### ${row.mapId} · ${row.view} · ${row.viewport}${row.toggle ? ` · toggle ${row.toggle}` : ''}`, '');
    if (row.void) lines.push(`**VOID — the pages disagree; the deltas below compare different scenes:** ${row.void.join('; ')}`, '');
    lines.push(`| step | ${labels.map((l) => `${l} GPU ms`).join(' | ')} | Δ GPU (pairs) | ${labels.map((l) => `${l} CPU ms`).join(' | ')} | ${labels.map((l) => `${l} draws`).join(' | ')} |`);
    lines.push(`| --- | ${labels.map(() => '---:').join(' | ')} | ---: | ${labels.map(() => '---:').join(' | ')} | ${labels.map(() => '---:').join(' | ')} |`);
    for (const p of row.stepNames) {
      const cell = (l, f) => row.byLabel[l].steps[p]?.[f] ?? '';
      lines.push(`| ${p} | ${labels.map((l) => cell(l, 'gpu')).join(' | ')} | ${delta(row.deltas?.steps[p]?.gpu)} | ${labels.map((l) => cell(l, 'cpu')).join(' | ')} | ${labels.map((l) => cell(l, 'calls')).join(' | ')} |`);
    }
    for (const [name, key] of [['frame GPU (whole-frame query)', 'gpuFrame'], ['frame GPU p25', 'gpuFrameP25'], ['main-thread CPU (render path)', 'cpuFrame'], ['draw calls', 'calls'], ['frame interval (presented)', 'interval']]) {
      lines.push(`| **${name}** | ${labels.map((l) => row.byLabel[l][key] ?? '').join(' | ')} | ${delta(row.deltas?.[key])} | | |`);
    }
    const cacheCell = (c) => (c ? `${c.rebuilds} rebuilds, ${c.reuses} reuses, ${c.full} ordinary (${c.unsettled} unsettled), ${c.copies} copies, ${c.contentChanges} content changes a frame; hash ${c.hashMs} ms${Object.keys(c.reasons).length ? `; rebuilt for ${Object.entries(c.reasons).map(([k, v]) => `${k} ${v}`).join(', ')}` : ''}` : '');
    if (labels.some((l) => row.byLabel[l].cache)) lines.push(`| **static shadow cache** | ${labels.map((l) => cacheCell(row.byLabel[l].cache)).join(' | ')} | | | |`);
    const proj = labels.map((l) => projectFrameMs({ gpuMs: row.byLabel[l].gpuFrameP25 ?? row.byLabel[l].gpuFrame, cpuMs: row.byLabel[l].cpuFrame }, ratios));
    lines.push(`| **projected ${proxy} frame (p25 GPU)** | ${proj.map((p) => `${p.frameMs} ms (${p.bound})`).join(' | ')} | | | |`, '');
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------------------------- CLI

if (isMainModule(import.meta.url)) {
  let options;
  try { options = parseFrameProbeArgs(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exit(1); }
  if (options.report) {
    const records = readSlotRecords(options.report);
    const report = buildFrameReport(records, options.labels, { twinTris: options.twinTrisTol, draws: options.drawsTol, stable: options.stableTol });
    const profiles = buildProfileReport(records);
    const outDir = options.report[0];
    writeFileSync(path.join(outDir, 'frame-report.json'), JSON.stringify({ ...report, cpuProfiles: profiles }, null, 1));
    let md = formatFrameReport(report);
    for (const [mapId, labels] of Object.entries(profiles)) {
      md += `\n### ${mapId} · main-thread CPU by chunk (ms per frame, CDP profile at the first pose)\n\n`;
      for (const [label, row] of Object.entries(labels)) {
        md += `- ${label} (${row.slots} slots): audio ${row.audio} · ${Object.entries(row.chunks).slice(0, 10).map(([k, v]) => `${k} ${v}`).join(' · ')}\n`;
      }
    }
    writeFileSync(path.join(outDir, 'frame-report.md'), md);
    console.log(md);
  } else {
    const result = await run(options);
    if (!result.ok) process.exitCode = 1;
  }
}
