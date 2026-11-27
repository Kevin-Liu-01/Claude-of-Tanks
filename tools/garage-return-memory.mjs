#!/usr/bin/env node
// garage-return-memory.mjs (battle-retention-279): what a page keeps across back-to-back battles on one map.
// Copyright (c) 2026 Kevin B. Liu. First-party tool; see NOTICE.md.
//
// One page, the Garage, then N battles (one map, or --sequence=map:mode[:spec],...), back to the Garage after each. Paths:
//   player:  __DEBUG.beginSoloBattle (the BATTLE button's start), a driven battle, then the player's own Leave: F4 opens
//            Settings and a trusted click presses its LEAVE BATTLE (settings.ts onLeaveBattle -> leaveBattleToGarage);
//   watched: __DEBUG.beginBattleEntry(..., { watch: true }) and __DEBUG.leaveBattleToGarage (the Reddit capture's path).
// Samples at each battle's start (its reveal plus a settle) and in the Garage after each leave and forced collections:
//   - the renderer's and GPU process's physical footprint and the browser tree, measured as the browser guard measures
//     them (ps RSS raised to footprint(1)'s phys_footprint; browser-launch.mjs measureTree);
//   - the page's JS heap and DOM (CDP Performance.getMetrics), per-worker heaps, and with --dump Chrome's memory-infra;
//   - three's own counts and the LIVE WebGL objects by kind (a create/delete hook installed before boot), live canvases;
//   - each battle's world held weakly (collected, current or alive), and the CSM shader registry: its size, its undrawn
//     entries, and (the registry ledger, Main 2026-11-27) the entries each battle's entry added that outlive that
//     battle's released world (registry staleTotal: 0 when no registration outlives its world).
// Opt-in censuses: --part-census (each battle's world group, ground occlusion, terrain and crater mesh held weakly; the
// property paths from window to an alive one), --buffer-census (ArrayBuffers >= 256 KB and canvases by creation site and
// battle), --entry-trace (footprint and resident worlds through each entry).
// The rules (each pre-registered with Main, 2026-11-27): slopeRule (RETAINS when the Garage-after-GC renderer's slope over
// >= 6 battles exceeds 5 % of battle 1's a battle), repeatRule (--roster=rotate --repeat-after=N), ruinFireRule (one battle
// with a drive), else the band (the last battle's readings within --band of battle 1's).
// --snapshots=1,3 writes V8 heap snapshots of the Garage after those battles (tools/heap-snapshot-diff.mjs, the
// evidence's world-retainers.mjs): such a run is DIAGNOSTIC, NOT JUDGED (`judgement`): a snapshot raises the renderer it
// measures by ~1.5-3 GB for the page's life (278: two snapshots read as +1.7 GB "retention" steps).
//
//   node tools/with-capture-lock.mjs --lock-class=render --place=<key> -- node tools/garage-return-memory.mjs \
//     (--url=<site> | --dist=<dir>) [--path=player|watched] [--map=verdant] [--mode=standard] [--spec=leo2a6] \
//     [--sequence=map:mode:spec,...] [--battles=4] [--seconds=30] [--tier=desktop|phone] [--roster=pinned|random|rotate] \
//     [--repeat-after=N] [--control=hold-visuals] [--drive=keys|raise|level] [--sample-every=s] [--snapshots=1,3] \
//     [--band=0.10] [--label=run] [--out=<dir>] [--gpu=metal|swiftshader] [--ride] [--dump] [--entry-trace] \
//     [--part-census] [--buffer-census] [--serve=preview|vercel] [--no-cache] [--port=4291]
// (--ride, watched path: the Reddit capture's take, fast-forwarded to contact and riding the nearest tank in a fight)
// Exit 0 when the rule holds (or the run is diagnostic), 1 when it does not, 2 on a run that did not finish (a guard
// trip is 86, the guard's). The pure rules are pinned by tools/garage-return-memory.selftest.mjs.
import { execFile, execFileSync } from 'node:child_process';
import { appendFileSync, createWriteStream, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import os from 'node:os';
import { launchGuardedBrowser, measureTree, parseFootprint, parsePsRows } from './browser-launch.mjs';
import { readinessExpression } from './game-readiness.mjs';
import { pinnedOpponents } from './frame-budget-probe.mjs';

const TOOL = 'garage-return-memory';
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const log = (line) => process.stderr.write(`[${TOOL} ${new Date().toISOString().slice(11, 19)}] ${line}\n`);

export function parseArgs(argv = process.argv.slice(2)) {
  const arg = (name, fallback) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
  const o = {
    url: arg('url', null), dist: arg('dist', null) ? resolve(arg('dist')) : null, port: Number(arg('port', 4291)),
    path: arg('path', 'player'), map: arg('map', 'verdant'), mode: arg('mode', 'standard'), spec: arg('spec', 'leo2a6'),
    battles: Number(arg('battles', 4)), seconds: Number(arg('seconds', 30)), tier: arg('tier', 'desktop'),
    roster: arg('roster', 'pinned'), snapshots: arg('snapshots', '').split(',').filter(Boolean).map(Number),
    band: Number(arg('band', 0.10)), label: arg('label', 'run'), gpu: arg('gpu', 'metal'), ride: argv.includes('--ride'), dump: argv.includes('--dump'), offset: Number(arg('offset', 0)),
    // (--random-deal) a forced roster dealt as a random battle: the random battle's own rolls (bot biome camo) on fixed seats
    randomDeal: argv.includes('--random-deal'), noCache: argv.includes('--no-cache'), serve: arg('serve', 'preview'),
    // (--drive=raise|level, player path) the replay drive (replay-flow.test-support.mjs drive): W, A/D in turn, one click a
    // shot every 2 s at a fifth of the way down the screen (raise: the gun raised into what is ahead) or near the middle
    // (level); (--sample-every=<s>) a sample in the battle every s seconds of the drive (the ruin-fire rule's readings)
    drive: arg('drive', 'keys'), sampleEvery: Number(arg('sample-every', 0)),
    // (--repeat-after=N, rotate roster) battles N+1..2N re-field battles 1..N's rosters (the repeat-roster bound rule);
    // (--control=hold-visuals) the page keeps every battle's bot visuals from its start (a per-battle registry: the rule's control)
    repeatAfter: Number(arg('repeat-after', 0)), control: arg('control', null),
    // (--entry-trace) through each battle's entry, about every second: the renderer, GPU process and tree (footprint-raised),
    // the world cache's ids and the page's phase (Main 2026-11-27: does an entry hold three worlds until the new one activates?)
    entryTrace: argv.includes('--entry-trace'),
    // (--buffer-census) every ArrayBuffer of 256 KB or more the page makes (typed-array and ArrayBuffer constructors) or
    // receives from a worker, and every canvas, held weakly with its creation site and the battle it was made in; each
    // Garage-after-GC sample lists the live ones by battle and site (what an earlier battle left alive, without a heap
    // snapshot: a snapshot of a big Garage passes the renderer cap)
    bufferCensus: argv.includes('--buffer-census'),
    // (--part-census) each battle's world parts held weakly (its group, ground occlusion handle, terrain group, crater
    // mesh); at each Garage-after-GC the alive ones of earlier battles, and every property path from window that reaches
    // one (values only, getters never called; arrays, Maps and Sets walked; closures are not visible to it)
    partCensus: argv.includes('--part-census'),
    // (--sequence=map:mode[:spec],...) a battle per entry in order (the Reddit capture's set a: verdant:standard:leo2a6,
    // desert:air_support:m1a1_abrams_sa, frontier:drone:t90m); --battles is its length
    sequence: arg('sequence', '').split(',').filter(Boolean).map((entry) => { const [map, mode, spec] = entry.split(':'); return { map, mode, spec }; }),
    out: resolve(arg('out', join(os.homedir(), 'cot-lanes', 'garage-return-memory', new Date().toISOString().slice(0, 16).replace(/[:T]/g, '')))),
  };
  if (!o.url === !o.dist) throw new Error(`${TOOL}: one of --url or --dist`);
  if (!['pinned', 'random', 'rotate'].includes(o.roster)) throw new Error(`${TOOL}: --roster=pinned|random|rotate`);
  if (!['player', 'watched'].includes(o.path)) throw new Error(`${TOOL}: --path=player|watched`);
  if (!['desktop', 'phone'].includes(o.tier)) throw new Error(`${TOOL}: --tier=desktop|phone`);
  if (o.sequence.length) o.battles = o.sequence.length;
  if (!(o.battles >= (o.sampleEvery > 0 ? 1 : 2))) throw new Error(`${TOOL}: --battles at least 2 (1 with --sample-every)`);
  if (o.repeatAfter && (o.roster !== 'rotate' || o.battles !== 2 * o.repeatAfter)) throw new Error(`${TOOL}: --repeat-after=N wants --roster=rotate and --battles=2N`);
  if (o.control && o.control !== 'hold-visuals') throw new Error(`${TOOL}: --control=hold-visuals`);
  if (!['keys', 'raise', 'level'].includes(o.drive)) throw new Error(`${TOOL}: --drive=keys|raise|level`);
  return o;
}

/** In-page, before boot: count the live WebGL objects by kind (create adds, delete removes; a lost context's are gone). */
export function installGlCensus() {
  const live = { texture: new Set(), buffer: new Set(), framebuffer: new Set(), renderbuffer: new Set(), program: new Set(),
    shader: new Set(), vertexArray: new Set(), query: new Set() };
  const created = Object.fromEntries(Object.keys(live).map((k) => [k, 0]));
  const kinds = [['Texture', 'texture'], ['Buffer', 'buffer'], ['Framebuffer', 'framebuffer'], ['Renderbuffer', 'renderbuffer'],
    ['Program', 'program'], ['Shader', 'shader'], ['VertexArray', 'vertexArray'], ['Query', 'query']];
  for (const proto of [globalThis.WebGL2RenderingContext?.prototype, globalThis.WebGLRenderingContext?.prototype]) {
    if (!proto) continue;
    for (const [name, key] of kinds) {
      const create = proto[`create${name}`], remove = proto[`delete${name}`];
      if (typeof create !== 'function' || typeof remove !== 'function') continue;
      proto[`create${name}`] = function (...args) { const o = create.apply(this, args); if (o) { live[key].add(o); created[key]++; } return o; };
      proto[`delete${name}`] = function (o, ...args) { if (o) live[key].delete(o); return remove.call(this, o, ...args); };
    }
  }
  // canvases: every one made through document.createElement or new OffscreenCanvas, held weakly; alive ones with their
  // pixel area (a 2D or GL backing is width x height x 4 bytes, wherever the browser keeps it)
  const canvases = [];
  const createElement = Document.prototype.createElement;
  Document.prototype.createElement = function (tag, ...rest) {
    const el = createElement.call(this, tag, ...rest);
    if (String(tag).toLowerCase() === 'canvas') canvases.push(new WeakRef(el));
    return el;
  };
  if (globalThis.OffscreenCanvas) {
    const Native = globalThis.OffscreenCanvas;
    globalThis.OffscreenCanvas = new Proxy(Native, { construct(target, args) { const c = new target(...args); canvases.push(new WeakRef(c)); return c; } });
  }
  const canvasCensus = () => {
    let alive = 0, megapixels = 0, big = 0;
    for (let i = canvases.length - 1; i >= 0; i--) {
      const c = canvases[i].deref();
      if (!c) { canvases.splice(i, 1); continue; }
      alive++;
      const px = (c.width || 0) * (c.height || 0);
      megapixels += px / 1e6;
      if (px >= 1024 * 1024) big++;
    }
    return { alive, big, mb: Math.round(megapixels * 4 * 10) / 10 };
  };
  window.__GL_CENSUS = () => ({ live: Object.fromEntries(Object.entries(live).map(([k, s]) => [k, s.size])), created: { ...created }, canvas: canvasCensus() });
}

/** In-page (--part-census): which earlier battles' world parts are alive, and the property paths from window to them. */
function partCensus() {
  const D = window.__DEBUG;
  const current = D?.world;
  const alive = [];
  const targets = new Map();
  for (const rec of window.__BR279_PARTS ?? []) {
    const row = { battle: rec.battle, map: rec.map };
    for (const [name, ref] of Object.entries(rec.parts)) {
      const o = ref?.deref();
      row[name] = !ref ? 'none' : !o ? 'collected' : (current && (o === current.group || o === current.groundOcclusion)) ? 'current' : 'alive';
      if (o && row[name] === 'alive' && !(current && rec.map === current.mapId)) targets.set(o, `b${rec.battle}.${name}`);
    }
    alive.push(row);
  }
  const paths = [];
  if (targets.size) {
    const seen = new Set();
    const queue = [[window, 'window']];
    seen.add(window);
    let visited = 0;
    const skip = new Set(['__BR279_PARTS', '__WORLD_REFS', '__BUFFER_CENSUS', '__BR279_HOLD']);
    while (queue.length && visited < 4_000_000 && paths.length < 40) {
      const [obj, path] = queue.shift();
      visited++;
      const visit = (value, label) => {
        if (!value || (typeof value !== 'object' && typeof value !== 'function')) return;
        if (targets.has(value)) { paths.push(`${targets.get(value)} <- ${path}${label}`); }
        if (seen.has(value)) return;
        if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer || value instanceof Node && value !== document) return;
        seen.add(value);
        if (path.length < 600) queue.push([value, `${path}${label}`]);
      };
      try {
        if (obj instanceof Map) { let i = 0; for (const [k, v] of obj) { visit(k, `.<mapkey${i}>`); visit(v, `.<map:${String(typeof k === 'string' ? k : i).slice(0, 40)}>`); i++; } }
        else if (obj instanceof Set) { let i = 0; for (const v of obj) visit(v, `.<set${i++}>`); }
        if (Array.isArray(obj)) { for (let i = 0; i < obj.length; i++) visit(obj[i], `[${i}]`); continue; }
        for (const key of Reflect.ownKeys(obj)) {
          if (obj === window && skip.has(key)) continue;
          const d = Object.getOwnPropertyDescriptor(obj, key);
          if (!d || !('value' in d)) continue;
          visit(d.value, `.${String(key).slice(0, 60)}`);
        }
        const proto = Object.getPrototypeOf(obj);
        if (proto && proto !== Object.prototype && proto !== Function.prototype) visit(proto, '.<proto>');
      } catch { /* an exotic object */ }
    }
    paths.push(`(walked ${visited} objects)`);
  }
  return { alive, paths };
}

/** In-page (--buffer-census): large buffers and canvases by creation site and battle, held weakly. */
function installBufferCensus() {
  const MIN = 256 * 1024;
  const records = []; const seen = new WeakSet();
  const site = (skip) => {
    const stack = String(new Error().stack ?? '').split('\n').slice(1 + skip);
    const frames = [];
    for (const line of stack) {
      const m = line.match(/at (?:(\S+) )?\(?(?:.*\/)?([^/\s)]+?):(\d+):(\d+)\)?$/);
      if (!m) continue;
      if (m[2].startsWith('pptr') || m[2] === '__puppeteer_evaluation_script__') continue;
      frames.push(`${m[1] ?? '?'}@${m[2].replace(/-[A-Za-z0-9_]{8}\.js$/, '')}:${m[4]}`);
      if (frames.length === 4) break;
    }
    return frames.join(' < ') || '(no stack)';
  };
  const battle = () => window.__BR279_BATTLE ?? 0;
  const note = (buffer, how, skip) => {
    if (!buffer || seen.has(buffer) || !(buffer.byteLength >= MIN)) return;
    seen.add(buffer);
    records.push({ ref: new WeakRef(buffer), bytes: buffer.byteLength, battle: battle(), site: how ?? site(skip) });
  };
  const bufferOf = (v) => (v instanceof ArrayBuffer ? v : ArrayBuffer.isView(v) && v.buffer instanceof ArrayBuffer ? v.buffer : null);
  for (const name of ['ArrayBuffer', 'Float32Array', 'Float64Array', 'Int8Array', 'Int16Array', 'Int32Array', 'Uint8Array',
    'Uint8ClampedArray', 'Uint16Array', 'Uint32Array', 'BigInt64Array', 'BigUint64Array']) {
    const Native = globalThis[name];
    if (typeof Native !== 'function') continue;
    const wrapped = new Proxy(Native, { construct(target, args, newTarget) {
      const made = Reflect.construct(target, args, newTarget === wrapped ? target : newTarget);
      const buffer = bufferOf(made);
      if (buffer && buffer.byteLength >= MIN && !seen.has(buffer)) note(buffer, null, 2);
      return made;
    } });
    try { Object.defineProperty(Native.prototype, 'constructor', { value: wrapped, writable: true, configurable: true }); } catch {}
    globalThis[name] = wrapped;
  }
  // buffers a worker sends (geometry and plans built off the page): scanned shallowly, tagged with the worker's script
  const scan = (value, how, depth) => {
    if (!value || typeof value !== 'object' || depth > 4) return;
    const buffer = bufferOf(value);
    if (buffer) { note(buffer, how, 0); return; }
    if (Array.isArray(value)) { for (let i = 0; i < Math.min(value.length, 4000); i++) scan(value[i], how, depth + 1); return; }
    if (value instanceof Map) { for (const v of value.values()) scan(v, how, depth + 1); return; }
    for (const key of Object.keys(value).slice(0, 400)) scan(value[key], how, depth + 1);
  };
  if (globalThis.Worker) {
    const NativeWorker = globalThis.Worker;
    globalThis.Worker = new Proxy(NativeWorker, { construct(target, args, newTarget) {
      const w = Reflect.construct(target, args, newTarget === globalThis.Worker ? target : newTarget);
      const how = `worker:${String(args[0]?.href ?? args[0] ?? '?').split('/').pop().replace(/-[A-Za-z0-9_]{8}\.js.*$/, '')}`;
      w.addEventListener('message', (event) => { try { scan(event.data, how, 0); } catch {} });
      return w;
    } });
  }
  const canvases = [];
  const createElement = Document.prototype.createElement;
  Document.prototype.createElement = function (tag, ...rest) {
    const el = createElement.call(this, tag, ...rest);
    if (String(tag).toLowerCase() === 'canvas') canvases.push({ ref: new WeakRef(el), battle: battle(), site: site(1) });
    return el;
  };
  if (globalThis.OffscreenCanvas) {
    const Native = globalThis.OffscreenCanvas;
    globalThis.OffscreenCanvas = new Proxy(Native, { construct(target, args, newTarget) {
      const c = Reflect.construct(target, args, newTarget === globalThis.OffscreenCanvas ? target : newTarget);
      canvases.push({ ref: new WeakRef(c), battle: battle(), site: site(1) });
      return c;
    } });
  }
  window.__BUFFER_CENSUS = (top = 25) => {
    const groups = new Map(); const byBattle = {}; let total = 0;
    const add = (kind, battleOf, siteOf, bytes) => {
      const key = `${kind}|${battleOf}|${siteOf}`;
      let g = groups.get(key); if (!g) groups.set(key, g = { kind, battle: battleOf, site: siteOf, count: 0, mb: 0 });
      g.count++; g.mb += bytes / 1048576;
      byBattle[`${kind}:${battleOf}`] = (byBattle[`${kind}:${battleOf}`] ?? 0) + bytes / 1048576;
      if (kind === 'buffer') total += bytes / 1048576;
    };
    for (let i = records.length - 1; i >= 0; i--) {
      const b = records[i].ref.deref();
      if (!b) { records.splice(i, 1); continue; }
      add('buffer', records[i].battle, records[i].site, b.byteLength);
    }
    for (let i = canvases.length - 1; i >= 0; i--) {
      const c = canvases[i].ref.deref();
      if (!c) { canvases.splice(i, 1); continue; }
      add('canvas', canvases[i].battle, canvases[i].site, (c.width || 0) * (c.height || 0) * 4);
    }
    const round = (n) => Math.round(n * 10) / 10;
    return { bufferMb: round(total), byBattle: Object.fromEntries(Object.entries(byBattle).map(([k, v]) => [k, round(v)])),
      groups: [...groups.values()].sort((a, b) => b.mb - a.mb).slice(0, top).map((g) => ({ ...g, mb: round(g.mb) })) };
  };
}

/**
 * In-page (battle-retention-279, Main 2026-11-27: no CSM registry entry outlives its world): the registry entries each
 * battle's entry added (between the Garage sample before it and its start sample), and at each Garage-after-GC those of a
 * released world (an earlier battle on another map) still registered while nothing in the scene or the resident world
 * draws them. The raw registry and its undrawn total also count the Garage's cached tank and fx materials, legitimately.
 */
function registryLedger(point, battle) {
  const D = window.__DEBUG;
  const shaders = D?.lighting?.csm?.shaders;
  if (!shaders) return null;
  const L = (window.__BR279_REG ??= { last: null, entries: [] });
  if (point === 'start') {
    const added = [];
    for (const material of shaders.keys()) if (!L.last || !L.last.has(material)) added.push(new WeakRef(material));
    L.entries.push({ battle, map: D?.world?.mapId ?? null, added });
    return { entryAdded: added.length };
  }
  L.last = new WeakSet(shaders.keys());
  if (point !== 'garage-after-gc' && point !== 'garage-boot-gc') return null;
  const drawn = new Set();
  const collect = (root) => root?.traverse?.((o) => {
    const m = o.material;
    if (Array.isArray(m)) for (const x of m) drawn.add(x); else if (m) drawn.add(m);
    if (o.customDepthMaterial) drawn.add(o.customDepthMaterial);
    if (o.customDistanceMaterial) drawn.add(o.customDistanceMaterial);
  });
  collect(D?.scene);
  collect(D?.world?.group);
  const current = D?.world?.mapId ?? null;
  const stale = {};
  let staleTotal = 0;
  for (const entry of L.entries) {
    if (entry.battle >= battle || entry.map === current) continue;
    const kinds = {};
    let n = 0;
    for (const ref of entry.added) {
      const m = ref.deref();
      if (!m || !shaders.has(m) || drawn.has(m)) continue;
      n++;
      const k = `${m.type}:${m.name || (typeof m.customProgramCacheKey === 'function' ? String(m.customProgramCacheKey()).slice(0, 40) : '')}`;
      kinds[k] = (kinds[k] ?? 0) + 1;
    }
    stale[`b${entry.battle}:${entry.map}`] = { count: n, kinds: Object.fromEntries(Object.entries(kinds).sort((a, b) => b[1] - a[1]).slice(0, 6)) };
    staleTotal += n;
  }
  return { staleTotal, stale };
}

/** In-page: the game's own counts and its residency. */
function gameCounts() {
  const D = window.__DEBUG;
  const r = D?.renderer;
  let objects = 0;
  D?.scene?.traverse(() => { objects++; });
  const copy = (value) => { try { return JSON.parse(JSON.stringify(value ?? null)); } catch { return null; } };
  return {
    phase: D?.game?.phase ?? null, geometries: r?.info?.memory?.geometries ?? null, textures: r?.info?.memory?.textures ?? null,
    programs: r?.info?.programs?.length ?? null, sceneObjects: objects, gl: window.__GL_CENSUS?.() ?? null,
    worldCacheIds: copy(D?.worldCacheIds), pedestalCacheIds: copy(D?.pedestalCacheIds)?.length ?? null,
    battleVisualPool: copy(D?.battleVisualPool),
    // the lighting rig's CSM shader registry (a Map of every material it patched; lighting.ts releaseCsmShaderMaterial)
    csmShaders: D?.lighting?.csm?.shaders?.size ?? null,
    // (battle-retention-279, Main 2026-11-27: no registry entry outlives its world) the registry's materials no mesh in the
    // scene or the resident world draws: an entry orphaned by a released world, or one registered for nothing
    ...(() => {
      const shaders = D?.lighting?.csm?.shaders;
      if (!shaders) return { csmOrphans: null };
      const drawn = new Set();
      const collect = (root) => root?.traverse?.((o) => {
        const m = o.material;
        if (Array.isArray(m)) for (const x of m) drawn.add(x); else if (m) drawn.add(m);
        if (o.customDepthMaterial) drawn.add(o.customDepthMaterial);
        if (o.customDistanceMaterial) drawn.add(o.customDistanceMaterial);
      });
      collect(D?.scene);
      collect(D?.world?.group);
      const orphans = [];
      for (const material of shaders.keys()) if (!drawn.has(material)) orphans.push(material);
      const kinds = {};
      for (const m of orphans) { const k = `${m.type}:${m.name || (typeof m.customProgramCacheKey === 'function' ? String(m.customProgramCacheKey()).slice(0, 40) : '')}`; kinds[k] = (kinds[k] ?? 0) + 1; }
      return { csmOrphans: orphans.length, csmOrphanKinds: Object.fromEntries(Object.entries(kinds).sort((a, b) => b[1] - a[1]).slice(0, 8)) };
    })(),
    worlds: (window.__WORLD_REFS ?? []).map(({ battle, ref }) => {
      const world = ref.deref();
      return { battle, state: !world ? 'collected' : world === D?.world ? 'current' : 'alive' };
    }),
  };
}

/**
 * Main's retention rule (2026-11-27, replacing the single-point battle-3 reading, which ±200 MB of footprint noise could
 * cross): RETAINS when the least-squares slope of the Garage-after-GC renderer over the battles is positive and more than
 * `perBattle` (5 %) of battle 1's reading per battle, over at least `minBattles` (6) battles.
 */
export function slopeRule(samples, { key = 'rendererMb', perBattle = 0.05, minBattles = 6 } = {}) {
  const rows = samples.filter((s) => s.point === 'garage-after-gc' && s.battle >= 1);
  const n = rows.length;
  if (n < 2) return { key, n, result: 'NOT MEASURED' };
  const xs = rows.map((r) => r.battle), ys = rows.map((r) => r[key]);
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
  const slope = sxy / sxx, first = rows.find((r) => r.battle === 1)?.[key] ?? ys[0];
  const slopePct = Math.round((slope / first) * 1000) / 10;
  const result = n < minBattles ? `TOO FEW (${n} < ${minBattles})` : slope > 0 && slope / first > perBattle ? 'RETAINS' : 'FLAT';
  return { key, n, slopeMbPerBattle: Math.round(slope * 10) / 10, slopePct, limitPct: perBattle * 100, result };
}

/**
 * The ruin-fire rule (pre-registered with Main, 2026-11-27, the Ruinspires guard trips): over one battle's drive sampled every
 * few seconds, the most the renderer and the GPU process reach stays within `boundMb` (600) of their reading 10 s into the
 * drive (the first fire sample at or after 10 s). A guard trip ends the run (exit 86) and fails it outside this function.
 */
export function ruinFireRule(samples, { boundMb = 600, baseS = 10 } = {}) {
  const fire = samples.filter((s) => s.point === 'fire');
  const base = fire.find((s) => s.driveS >= baseS);
  if (!base) return { pass: false, why: 'no fire sample at 10 s' };
  const rows = ['rendererMb', 'gpuMb', 'treeMb', 'jsHeapUsedMb'].map((key) => {
    const max = Math.max(...fire.map((s) => s[key]));
    return { key, baseMb: base[key], maxMb: max, growthMb: Math.round((max - base[key]) * 10) / 10 };
  });
  const judged = rows.filter((r) => r.key === 'rendererMb' || r.key === 'gpuMb');
  return { boundMb, baseAtS: base.driveS, shots: fire[fire.length - 1]?.shots ?? 0, rows, pass: judged.every((r) => r.growthMb <= boundMb) };
}

/**
 * The repeat-roster bound rule (pre-registered with Main, 2026-11-27, for the V8 growth; the class rule: every cache keyed by
 * a tank spec or id has a stated bound or is released at the Garage). Battles 1..N each field 13 opponents new to the run;
 * battles N+1..2N field battles 1..N's rosters again. PASS when both hold, on the Garage-after-GC readings:
 *   - new specs: the renderer and the GPU process after battle N within `band` (10 %) of battle 1's;
 *   - repeats: the JS heap after battle 2N within max(`heapMb` 8 MB, `heapPct` 3 %) (the pinned live runs moved ±4 MB a battle) of battle N's, and the renderer and
 *     GPU after battle 2N within `band` of battle N's.
 * The JS heap is not judged over the new-spec half: a family's code and spec data load on its first battle, once.
 */
export function repeatRule(samples, n, { band = 0.10, heapMb = 8, heapPct = 0.03 } = {}) {
  const g = (k) => samples.find((s) => s.point === 'garage-after-gc' && s.battle === k);
  const a = g(1), b = g(n), c = g(2 * n);
  if (!a || !b || !c) return { pass: false, error: 'missing Garage-after-GC rows' };
  const pct = (x, y) => Math.round(((y - x) / x) * 1000) / 10;
  const heapLimit = Math.max(heapMb, b.jsHeapUsedMb * heapPct);
  const rows = [
    { half: 'new', key: 'rendererMb', fromMb: a.rendererMb, toMb: b.rendererMb, risePct: pct(a.rendererMb, b.rendererMb), pass: b.rendererMb <= a.rendererMb * (1 + band) },
    { half: 'new', key: 'gpuMb', fromMb: a.gpuMb, toMb: b.gpuMb, risePct: pct(a.gpuMb, b.gpuMb), pass: b.gpuMb <= a.gpuMb * (1 + band) },
    { half: 'repeat', key: 'jsHeapUsedMb', fromMb: b.jsHeapUsedMb, toMb: c.jsHeapUsedMb, riseMb: Math.round((c.jsHeapUsedMb - b.jsHeapUsedMb) * 10) / 10, limitMb: Math.round(heapLimit * 10) / 10, pass: c.jsHeapUsedMb - b.jsHeapUsedMb <= heapLimit },
    { half: 'repeat', key: 'rendererMb', fromMb: b.rendererMb, toMb: c.rendererMb, risePct: pct(b.rendererMb, c.rendererMb), pass: c.rendererMb <= b.rendererMb * (1 + band) },
    { half: 'repeat', key: 'gpuMb', fromMb: b.gpuMb, toMb: c.gpuMb, risePct: pct(b.gpuMb, c.gpuMb), pass: c.gpuMb <= b.gpuMb * (1 + band) },
  ];
  return { n, band, rows, pass: rows.every((r) => r.pass) };
}

/**
 * (battle-retention-279, Main 2026-11-27) The run's judgement. A run that took a heap snapshot is diagnostic, never judged:
 * a snapshot raises the renderer's own footprint by ~1.5-3 GB for the rest of the page's life (278: two snapshots read as
 * +1.7 GB retention steps), so its readings answer "what holds this", never "does it retain". Otherwise the run's rule:
 * the ruin-fire rule (one battle with a drive), the repeat-roster rule (--repeat-after) or the band.
 */
export function judgement(o, samples, ruinRule = null) {
  if (o.snapshots?.length) {
    return { diagnostic: true, judged: false, note: `diagnostic, not judged (--snapshots=${o.snapshots.join(',')}: a heap snapshot inflates the renderer it measures)` };
  }
  if (o.battles === 1 && ruinRule) return { pass: ruinRule.pass, ruin: true };
  return o.repeatAfter ? repeatRule(samples, o.repeatAfter, { band: o.band }) : bandVerdict(samples, o.band, o.battles);
}

/** The verdict: each reading after the last battle against battle 1's, within `band`. */
export function bandVerdict(samples, band = 0.10, battles = null) {
  const gcRows = samples.filter((s) => s.point === 'garage-after-gc');
  const first = gcRows.find((s) => s.battle === 1);
  const last = battles ? gcRows.find((s) => s.battle === battles) : gcRows[gcRows.length - 1];
  if (!first || !last || first === last) return { pass: false, error: 'missing Garage-after-GC rows', rows: [] };
  const rows = ['rendererMb', 'gpuMb', 'jsHeapUsedMb'].map((key) => {
    const rise = (last[key] - first[key]) / first[key];
    return { key, battle1: first[key], last: last[key], lastBattle: last.battle, risePct: Math.round(rise * 1000) / 10, pass: rise <= band };
  });
  return { band, pass: rows.every((row) => row.pass), rows };
}

/**
 * (--serve=vercel) The dist served as production serves it, not as vite preview does: brotli where the client asks for it
 * (compressible types; compressed once and kept), `public, max-age=31536000, immutable` on /assets/, `public, max-age=0,
 * must-revalidate` elsewhere, and vercel.json's headers for every path (COOP, CSP, ...). Clean URLs: /x serves x.html.
 */
async function serveVercelLike(dist, port) {
  const { createServer } = await import('node:http');
  const { readFile, stat } = await import('node:fs/promises');
  const { brotliCompressSync, constants } = await import('node:zlib');
  const { extname, join: joinPath, normalize } = await import('node:path');
  const root = new URL('..', import.meta.url).pathname;
  const vercel = JSON.parse(await readFile(joinPath(root, 'vercel.json'), 'utf8'));
  const always = (vercel.headers ?? []).find((h) => h.source === '/:path(.*)')?.headers ?? [];
  const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.mjs': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.wasm': 'application/wasm', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.gz': 'application/gzip',
    '.bin': 'application/octet-stream', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
    '.webm': 'video/webm', '.mp4': 'video/mp4', '.xml': 'application/xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
  const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.wasm', '.txt', '.xml', '.bin', '.webmanifest']);
  const brCache = new Map();
  const server = createServer(async (req, res) => {
    try {
      let pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (pathname.endsWith('/')) pathname += 'index.html';
      let file = normalize(joinPath(dist, pathname));
      if (!file.startsWith(dist)) { res.writeHead(403).end(); return; }
      let info = await stat(file).catch(() => null);
      if (!info && !extname(file)) { file += '.html'; info = await stat(file).catch(() => null); }
      if (!info || !info.isFile()) { res.writeHead(404).end(); return; }
      const ext = extname(file).toLowerCase();
      const headers = Object.fromEntries(always.map((h) => [h.key, h.value]));
      headers['Content-Type'] = TYPES[ext] ?? 'application/octet-stream';
      headers['Cache-Control'] = pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate';
      let body = await readFile(file);
      if (COMPRESSIBLE.has(ext) && /\bbr\b/.test(req.headers['accept-encoding'] ?? '')) {
        let br = brCache.get(file);
        if (!br) { br = brotliCompressSync(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } }); brCache.set(file, br); }
        body = br; headers['Content-Encoding'] = 'br'; headers.Vary = 'Accept-Encoding';
      }
      headers['Content-Length'] = body.length;
      res.writeHead(200, headers);
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch (error) { res.writeHead(500).end(String(error?.message ?? error)); }
  });
  await new Promise((done) => server.listen(port, '127.0.0.1', done));
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise((done) => server.close(() => done())) };
}

async function serveDist(dist, port) {
  const vite = await import('vite');
  const root = new URL('..', import.meta.url).pathname;
  const server = await vite.preview({ root, logLevel: 'error', build: { outDir: dist }, preview: { host: '127.0.0.1', port, strictPort: true, open: false } });
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise((done) => server.httpServer.close(() => done())) };
}

const PHONE = {
  viewport: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true, isLandscape: false },
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
};

export async function runGarageReturnMemory(o) {
  mkdirSync(o.out, { recursive: true });
  const jsonl = join(o.out, `${o.label}.samples.jsonl`);
  writeFileSync(jsonl, '');
  const report = { tool: TOOL, ...o, samples: [], errors: [], startedAt: new Date().toISOString() };
  const { default: puppeteer } = await import('puppeteer');
  let server = null, browser = null;
  try {
    if (o.dist) server = o.serve === 'vercel' ? await serveVercelLike(o.dist, o.port) : await serveDist(o.dist, o.port);
    const base = o.url ?? server.url;
    const gpuArgs = o.gpu === 'metal' ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-gl=angle', '--enable-webgl'];
    browser = await launchGuardedBrowser(puppeteer, { headless: 'new', protocolTimeout: 900_000, defaultViewport: null,
      args: [...gpuArgs, '--no-sandbox', '--disable-dev-shm-usage', '--mute-audio', '--window-size=1920,1200'] }, { label: `${TOOL}:${o.label}` });
    const rootPid = browser.process()?.pid;
    const page = await browser.newPage();
    if (o.tier === 'phone') await page.emulate(PHONE); else await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
    page.on('pageerror', (error) => report.errors.push(String(error?.message ?? error).slice(0, 300)));
    await page.evaluateOnNewDocument(installGlCensus);
    if (o.bufferCensus) await page.evaluateOnNewDocument(installBufferCensus);
    await page.evaluateOnNewDocument(() => {
      Document.prototype.hasFocus = () => true;
      try {
        localStorage.setItem('cot.telemetry', 'off');
        localStorage.setItem('cot.tutorial.v1', '{"v":2,"garage":"skipped","training":"skipped","debrief":"skipped","tour":"skipped","offer":"later"}');
        localStorage.setItem('cot.battle.hints.v2', JSON.stringify({ battles: 3, learned: [] }));
        localStorage.setItem('cot.armourOverlayDefault.v1', 'done');
      } catch { /* storage blocked */ }
    });
    const cdp = await page.createCDPSession();
    await cdp.send('Performance.enable');
    // (--no-cache) the HTTP memory and disk caches off for this page (CDP Network.setCacheDisabled): a resource or a decoded
    // image kept by URL across battles is not kept
    if (o.noCache) { await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true }); }
    const collect = async () => {
      // WeakRefs clear only between tasks: collect, yield, collect again
      for (let i = 0; i < 3; i++) {
        await cdp.send('HeapProfiler.collectGarbage');
        for (const worker of page.workers()) await worker.client.send('HeapProfiler.collectGarbage').catch(() => {});
        await page.evaluate(() => new Promise((done) => setTimeout(done, 100)));
      }
      await sleep(2500);
    };
    // (--entry-trace) a light sampler beside the entry's own waits: no GC, no CDP heap calls, the page asked with a time limit
    // (a loading page's main thread can be busy for seconds; a missed answer is recorded as null, not waited for)
    const run = (cmd, args) => new Promise((done) => execFile(cmd, args, { encoding: 'utf8', timeout: 30_000, maxBuffer: 1 << 24 }, (e, out) => done(e ? '' : out)));
    const entryTrace = (battle, map) => {
      let stopped = false;
      const t0 = Date.now();
      let lastIds = null;
      const loop = (async () => {
        while (!stopped) {
          const rows = parsePsRows(await run('ps', ['-ww', '-o', 'pid=,pgid=,ppid=,rss=,command=', '-g', String(rootPid)]));
          const big = measureTree(rows, rootPid).processes.filter((p) => p.type === 'renderer' || p.type === 'gpu-process').map((p) => p.pid);
          const foot = big.length ? parseFootprint(await run('/usr/bin/footprint', ['--noCategories', '-f', 'bytes', ...big.flatMap((pid) => ['-p', String(pid)])])) : new Map();
          const tree = measureTree(rows, rootPid, foot);
          const state = await Promise.race([
            page.evaluate(() => { const D = window.__DEBUG; return { ids: D?.worldCacheIds ?? null, current: D?.world?.mapId ?? null, phase: D?.game?.phase ?? null }; }).catch(() => null),
            sleep(1500).then(() => null),
          ]);
          const e = { point: 'entry', battle, map, tMs: Date.now() - t0, rendererMb: Math.round(tree.rendererMb), gpuMb: Math.round(tree.gpuMb), treeMb: Math.round(tree.treeMb),
            footprintRead: foot.size > 0, ids: state?.ids ?? null, current: state?.current ?? null, phase: state?.phase ?? null };
          report.samples.push(e);
          appendFileSync(jsonl, `${JSON.stringify(e)}\n`);
          const ids = JSON.stringify(e.ids);
          if (ids !== lastIds || e.tMs < 1500) log(`  entry ${battle} t+${(e.tMs / 1000).toFixed(1)}s renderer ${e.rendererMb} gpu ${e.gpuMb} tree ${e.treeMb}; cache ${ids}; current ${e.current}; phase ${e.phase}`);
          if (e.ids) lastIds = ids;
          await sleep(700);
        }
      })();
      return { stop: async () => {
        stopped = true; await loop;
        const rows = report.samples.filter((x) => x.point === 'entry' && x.battle === battle);
        const peak = rows.reduce((m, x) => (!m || x.treeMb > m.treeMb ? x : m), null);
        if (peak) log(`  entry ${battle} peak tree ${peak.treeMb} (renderer ${peak.rendererMb}, gpu ${peak.gpuMb}) at t+${(peak.tMs / 1000).toFixed(1)}s; cache then ${JSON.stringify(peak.ids)}`);
      } };
    };
    const sample = async (point, battle = 0) => {
      const rows = parsePsRows(execFileSync('ps', ['-ww', '-o', 'pid=,pgid=,ppid=,rss=,command=', '-g', String(rootPid)], { encoding: 'utf8' }));
      const first = measureTree(rows, rootPid);
      const big = first.processes.filter((p) => p.type === 'renderer' || p.type === 'gpu-process').map((p) => p.pid);
      let foot = new Map();
      if (big.length) {
        try { foot = parseFootprint(execFileSync('/usr/bin/footprint', ['--noCategories', '-f', 'bytes', ...big.flatMap((pid) => ['-p', String(pid)])], { encoding: 'utf8', timeout: 60_000 })); } catch { /* RSS only */ }
      }
      const tree = measureTree(rows, rootPid, foot);
      const metrics = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
      const mb = (n) => Math.round(n * 10) / 10;
      // each worker's own heap (a worker's isolate is in the renderer, outside the page's heap): used + array buffers
      const workers = [];
      for (const worker of page.workers()) {
        try {
          const u = await worker.client.send('Runtime.getHeapUsage');
          workers.push({ url: worker.url().replace(/^.*\/(assets\/)?/, '').slice(0, 60), usedMb: mb(u.usedSize / 2 ** 20), backingMb: mb((u.backingStorageSize ?? 0) / 2 ** 20) });
        } catch { /* a worker that ended */ }
      }
      const workerMb = mb(workers.reduce((sum, w) => sum + w.usedMb + w.backingMb, 0));
      let infra = null;
      if (o.dump && point !== 'start') {
        const { memoryInfraDump } = await import('./battle-memory-probe.mjs');
        infra = Object.fromEntries(Object.entries(await memoryInfraDump(browser)).filter(([name]) => /renderer/i.test(name)));
      }
      const s = { t: new Date().toISOString(), point, battle, rendererMb: mb(tree.rendererMb), gpuMb: mb(tree.gpuMb), treeMb: mb(tree.treeMb),
        jsHeapUsedMb: mb((metrics.JSHeapUsedSize ?? 0) / 2 ** 20), nodes: metrics.Nodes, listeners: metrics.JSEventListeners,
        documents: metrics.Documents, footprintRead: foot.size > 0, workerMb, workers, ...(infra ? { infra } : {}), ...(await page.evaluate(gameCounts)) };
      s.registry = await page.evaluate(registryLedger, point, battle).catch(() => null);
      report.samples.push(s);
      appendFileSync(jsonl, `${JSON.stringify(s)}\n`);
      log(`${point} ${battle}: renderer ${s.rendererMb} gpu ${s.gpuMb} tree ${s.treeMb} heap ${s.jsHeapUsedMb} MB; geo ${s.geometries} tex ${s.textures} `
        + `prog ${s.programs}; workers ${s.workerMb} MB (${s.workers.length}); canvas ${JSON.stringify(s.gl?.canvas)}; gl ${JSON.stringify(s.gl?.live)}; worlds ${s.worlds.map((w) => `${w.battle}:${w.state}`).join(' ')}; cache ${JSON.stringify(s.worldCacheIds)}; csm ${s.csmShaders} orphans ${s.csmOrphans} ${JSON.stringify(s.csmOrphanKinds ?? {})}`);
      if (infra) for (const [proc, rows] of Object.entries(infra)) log(`  infra ${proc}: ${JSON.stringify(rows).slice(0, 1200)}`);
      if (point !== 'start') log(`  workers ${JSON.stringify(workers)}`);
      if (s.registry && point !== 'start') log(`  registry ${battle}: ${JSON.stringify(s.registry).slice(0, 1500)}`);
      if (s.registry && point === 'start') log(`  registry ${battle}: entry added ${s.registry.entryAdded}`);
      if (o.partCensus && point === 'garage-after-gc') {
        s.partCensus = await page.evaluate(partCensus).catch((e) => ({ error: String(e).slice(0, 200) }));
        appendFileSync(jsonl, `${JSON.stringify({ point: `${point}-parts`, battle, partCensus: s.partCensus })}\n`);
        log(`  parts ${battle}: ${JSON.stringify(s.partCensus).slice(0, 4000)}`);
      }
      if (o.bufferCensus && point !== 'start') {
        s.bufferCensus = await page.evaluate(() => window.__BUFFER_CENSUS?.(30) ?? null).catch(() => null);
        appendFileSync(jsonl, `${JSON.stringify({ point: `${point}-buffers`, battle, bufferCensus: s.bufferCensus })}\n`);
        if (s.bufferCensus) {
          log(`  buffers ${battle}: tracked ${s.bufferCensus.bufferMb} MB; by battle ${JSON.stringify(s.bufferCensus.byBattle)}`);
          for (const g of s.bufferCensus.groups) log(`    ${String(g.mb).padStart(7)} MB ${g.kind} b${g.battle} x${g.count} ${g.site}`);
        }
      }
      return s;
    };
    const snapshot = async (battle) => {
      const file = join(o.out, `${o.label}-garage-after-${battle}.heapsnapshot`);
      const stream = createWriteStream(file);
      const onChunk = ({ chunk }) => stream.write(chunk);
      cdp.on('HeapProfiler.addHeapSnapshotChunk', onChunk);
      try { await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false, captureNumericValue: false }); }
      finally { cdp.off('HeapProfiler.addHeapSnapshotChunk', onChunk); }
      await new Promise((done) => stream.end(done));
      log(`snapshot ${file}`);
      return file;
    };

    const query = `nosplash=1&telemetry=off&tier=${o.tier === 'phone' ? 'mobile' : 'desktop'}`;
    await page.goto(`${base}/?${query}`, { waitUntil: 'domcontentloaded', timeout: 300_000 });
    await page.waitForFunction(`${readinessExpression('garage')} && !!window.__DEBUG`, { timeout: 600_000, polling: 500 });
    await sleep(3000);
    report.version = await page.evaluate(() => document.querySelector('meta[name="cot-version"]')?.content ?? window.__COT_VERSION__ ?? null);
    const catalog = await page.evaluate(() => window.__DEBUG.game.allTanks.map((e) => e.specId));
    const forceRoster = (ids) => page.evaluate((list) => { const f = window.__DEBUG.flags; f.forceRoster = list; f.rosterExact = true; }, ids);
    if (o.roster === 'pinned') await forceRoster(pinnedOpponents(catalog, o.spec, 13));
    await collect();
    await sample('garage-boot-gc');
    if (o.snapshots.includes(0)) report.snapshots = [...(report.snapshots ?? []), await snapshot(0)];

    for (let battle = 1; battle <= o.battles; battle++) {
      // (--roster=rotate) 13 opponents of their own each battle, the same ones in every run (a random roster's new specs,
      // reproducibly: the catalog sorted, battle k's seats from offset 13k)
      if (o.roster === 'rotate') {
        const pool = [...new Set(catalog)].filter((id) => id !== o.spec).sort();
        const rosterIndex = o.repeatAfter > 0 ? (battle - 1) % o.repeatAfter : battle - 1;
        await forceRoster(Array.from({ length: 13 }, (_, i) => pool[((rosterIndex + o.offset) * 13 + i * 7) % pool.length]));
      }
      const step = o.sequence[battle - 1] ?? {};
      const B = { map: step.map ?? o.map, mode: step.mode ?? o.mode, spec: step.spec ?? o.spec };
      log(`battle ${battle} ${B.map}:${B.mode} ${B.spec} (${o.path})`);
      await page.evaluate((n) => { window.__BR279_BATTLE = n; }, battle);
      const trace = o.entryTrace ? entryTrace(battle, B.map) : null;
      if (o.path === 'player') {
        await page.evaluate((r) => { setTimeout(() => window.__DEBUG.beginSoloBattle({ ...r, randomRoster: r.randomRoster }), 0); },
          { specId: B.spec, mapId: B.map, gameMode: B.mode, randomRoster: o.roster === 'random' || o.randomDeal });
        await page.waitForFunction(readinessExpression('controlsReleased'), { timeout: 900_000, polling: 500 });
      } else {
        await page.evaluate((r) => { setTimeout(() => window.__DEBUG.beginBattleEntry(r.specId, r.mapId, { gameMode: r.gameMode, watch: true, randomRoster: r.randomRoster }), 0); },
          { specId: B.spec, mapId: B.map, gameMode: B.mode, randomRoster: o.roster === 'random' });
        await page.waitForFunction(readinessExpression('battleRevealed'), { timeout: 900_000, polling: 500 });
      }
      await sleep(4000);
      if (trace) await trace.stop();
      await page.evaluate((n) => {
        const world = window.__DEBUG?.world;
        if (!world) return;
        (window.__WORLD_REFS ??= []).push({ battle: n, ref: new WeakRef(world) });
        // a marker class per battle, held by the world: a heap snapshot names a retained world's holders by it
        // (BR279World_<battle>; a world entered again keeps its first marker)
        const markers = [class BR279World_1 {}, class BR279World_2 {}, class BR279World_3 {}, class BR279World_4 {},
          class BR279World_5 {}, class BR279World_6 {}, class BR279World_7 {}, class BR279World_8 {}];
        world.__br279Marker ??= new markers[(n - 1) % markers.length]();
        const terrain = world.group?.children?.find?.((c) => c?.userData?.terrainChunks) ?? null;
        // a marker class per battle held by the world's group: a heap snapshot names the group's holders by it
        const groupMarkers = [class BR279Group_1 {}, class BR279Group_2 {}, class BR279Group_3 {}, class BR279Group_4 {},
          class BR279Group_5 {}, class BR279Group_6 {}, class BR279Group_7 {}, class BR279Group_8 {}];
        if (world.group) world.group.userData.__br279GroupMarker ??= new groupMarkers[(n - 1) % groupMarkers.length]();
        const ref = (o) => (o && typeof o === 'object' ? new WeakRef(o) : null);
        (window.__BR279_PARTS ??= []).push({ battle: n, map: world.mapId, parts: { group: ref(world.group), groundOcclusion: ref(world.groundOcclusion),
          terrain: ref(terrain), craterMesh: ref(terrain?.userData?.craterMesh) } });
      }, battle);
      const s0 = await sample('start', battle);
      s0.roster = await page.evaluate(() => window.__DEBUG.game.tanks.map((t) => t.specId ?? t.spec?.id ?? '?'));
      log(`  roster ${battle}: ${s0.roster.join(' ')}`);
      if (o.control === 'hold-visuals') {
        s0.held = await page.evaluate(() => {
          const visuals = window.__DEBUG.game.tanks.filter((t) => t !== window.__DEBUG.game.player).map((t) => t.visual).filter(Boolean);
          (window.__BR279_HOLD ??= []).push(visuals);
          return visuals.length;
        });
        log(`  control: holding ${s0.held} visuals of battle ${battle}`);
      }
      if (o.path === 'player' && o.drive !== 'keys') {
        const vp = o.tier === 'phone' ? { width: 390, height: 844 } : { width: 1920, height: 1080 };
        const at = { x: Math.round(vp.width / 2), y: Math.round(vp.height * (o.drive === 'raise' ? 0.2 : 0.39)) };
        await page.mouse.click(at.x, Math.round(vp.height * 0.47)); // the stage takes the pointer (headless may refuse it)
        await sleep(300);
        if (o.drive === 'raise') { await page.mouse.move(at.x, Math.round(vp.height * 0.47)); await page.mouse.move(at.x, at.y, { steps: 8 }); }
        const started = Date.now(), until = started + o.seconds * 1000;
        let shots = 0, nextSample = o.sampleEvery > 0 ? started + o.sampleEvery * 1000 : Infinity;
        await page.keyboard.down('KeyW');
        try {
          for (let turn = 0; Date.now() < until; turn++) {
            const key = turn % 2 ? 'KeyA' : 'KeyD';
            await page.keyboard.down(key); await sleep(900); await page.keyboard.up(key);
            await page.mouse.click(at.x, at.y); shots++;
            await sleep(1100);
            if (Date.now() >= nextSample) {
              const s1 = await sample('fire', battle);
              s1.driveS = Math.round((Date.now() - started) / 1000); s1.shots = shots;
              s1.gunPitchDeg = await page.evaluate(() => { const p = window.__DEBUG?.game?.player; return p?.state ? Math.round(p.state.gunPitch * 5730) / 100 : null; });
              log(`  fire t+${s1.driveS}s shots ${shots} pitch ${s1.gunPitchDeg}`);
              nextSample += o.sampleEvery * 1000;
            }
          }
        } finally { await page.keyboard.up('KeyW'); }
        if (o.battles === 1) { report.ruinRule = ruinFireRule(report.samples); if (!o.snapshots.length) log(`ruin-fire rule ${JSON.stringify(report.ruinRule)}`); break; }
        await page.keyboard.press('F4');
        let leave = null;
        for (let i = 0; i < 20 && !leave; i++) {
          await sleep(250);
          leave = await page.evaluate(() => {
            const button = document.querySelector('.cot-settings.open .cot-set-btn.leave');
            const box = button?.getBoundingClientRect();
            return box && box.width > 0 && getComputedStyle(button).display !== 'none' ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : null;
          });
          if (!leave && i === 8) await page.keyboard.press('Escape');
        }
        if (!leave) throw new Error('no LEAVE BATTLE drawn on the Settings pause');
        await page.mouse.click(leave.x, leave.y);
      } else if (o.path === 'player') {
        // a driven battle: forward, turning, firing (battle-spike-census driveBattle's moves)
        await page.evaluate(() => { window.__DEBUG.flags.forceFire = true; });
        await page.keyboard.down('KeyW');
        const until = Date.now() + o.seconds * 1000;
        for (let turn = 0; Date.now() < until; turn++) {
          const key = turn % 2 ? 'KeyD' : 'KeyA';
          await page.keyboard.down(key); await sleep(800); await page.keyboard.up(key); await sleep(1200);
        }
        await page.keyboard.up('KeyW');
        await page.evaluate(() => { window.__DEBUG.flags.forceFire = false; });
        // the player's Leave: F4 opens Settings (solo), then a trusted click on its LEAVE BATTLE
        await page.keyboard.press('F4');
        let leave = null;
        for (let i = 0; i < 20 && !leave; i++) {
          await sleep(250);
          leave = await page.evaluate(() => {
            const button = document.querySelector('.cot-settings.open .cot-set-btn.leave');
            const box = button?.getBoundingClientRect();
            return box && box.width > 0 && getComputedStyle(button).display !== 'none' ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : null;
          });
          if (!leave && i === 8) await page.keyboard.press('Escape');
        }
        if (!leave) throw new Error('no LEAVE BATTLE drawn on the Settings pause');
        if (o.tier === 'phone') await page.touchscreen.tap(leave.x, leave.y); else await page.mouse.click(leave.x, leave.y);
      } else {
        if (o.ride) {
          // (--ride) the Reddit capture's watched take: fast-forward to contact (8 s at a time, at most 8 times), then ride
          // the nearest tank with an enemy within 180 m
          const pickRide = () => page.evaluate(() => {
            const alive = window.__DEBUG.game.tanks.filter((t) => t.state && !t.combat?.destroyed);
            let best = null;
            for (const a of alive) for (const b of alive) {
              if (a.team === b.team) continue;
              const d = a.state.pos.distanceTo(b.state.pos);
              if (!best || d < best.d) best = { id: a.id, d };
            }
            return best;
          });
          let ride = await pickRide();
          for (let k = 0; k < 8 && ride && ride.d > 180; k++) {
            await page.evaluate(() => { try { window.__DEBUG.fastForward(8); } catch { /* none */ } });
            await sleep(600);
            ride = await pickRide();
          }
          if (ride) await page.evaluate((id) => window.__DEBUG.watch?.rideId?.(id), ride.id);
        }
        await sleep(o.seconds * 1000);
        await page.evaluate(() => window.__DEBUG.leaveBattleToGarage());
      }
      await page.waitForFunction(readinessExpression('garage'), { timeout: 300_000, polling: 500 });
      await sleep(3000);
      await collect();
      await sample('garage-after-gc', battle);
      if (o.snapshots.includes(battle)) report.snapshots = [...(report.snapshots ?? []), await snapshot(battle)];
    }
    report.verdict = judgement(o, report.samples, report.ruinRule ?? null);
    if (report.verdict.diagnostic) { log(`verdict: ${report.verdict.note}`); return report; }
    const base0 = report.samples[0];
    if (o.battles === 1) { log(`ruin verdict ${JSON.stringify(report.verdict)}`); return report; }
    report.rule = { statement: 'retained if the Garage-after-GC renderer after battle 3 is > 10 % above the one after battle 1 (Main 2026-11-27)' };
    const g = (n) => report.samples.find((s) => s.point === 'garage-after-gc' && s.battle === n);
    if (g(1) && g(3)) {
      const rise = (g(3).rendererMb - g(1).rendererMb) / g(1).rendererMb;
      Object.assign(report.rule, { battle1Mb: g(1).rendererMb, battle3Mb: g(3).rendererMb, risePct: Math.round(rise * 1000) / 10, result: rise > 0.10 ? 'RETAINS' : 'FLAT' });
    }
    report.slope = Object.fromEntries(['rendererMb', 'gpuMb', 'jsHeapUsedMb'].map((key) => [key, slopeRule(report.samples, { key })]));
    log(`boot ${base0.rendererMb} MB; rule ${JSON.stringify(report.rule)}`);
    log(`slope rule ${JSON.stringify(report.slope)}`);
    log(`band ${JSON.stringify(report.verdict)}`);
  } catch (error) {
    report.errors.push(String(error?.stack ?? error).slice(0, 1500));
    report.verdict = { pass: false, error: String(error?.message ?? error) };
    log(`FAIL ${error?.message}`);
  } finally {
    report.finishedAt = new Date().toISOString();
    writeFileSync(join(o.out, `${o.label}.json`), `${JSON.stringify(report, null, 1)}\n`);
    if (browser) await browser.close().catch(() => browser.process()?.kill('SIGKILL'));
    if (server) await server.close().catch(() => {});
  }
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = await runGarageReturnMemory(parseArgs());
  process.exit(report.verdict?.error ? 2 : report.verdict?.diagnostic || report.verdict?.pass ? 0 : 1);
}
