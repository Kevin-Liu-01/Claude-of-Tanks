// Round 2 (2026-11-03 critic U33, Q15): the fx clock's rebase registry (fx/timeShift.ts) is complete by census, not by a
// list of names. Round one's receipt (clockRebase.selftest) checked that a fixed list of 18 parts was registered, so a
// stamp nobody registered passed it: the HE round records (burstAt, roundEndedAt, the waiting hull events' time), the
// struck buildings' dust load, the salvo crowd ring, the track skirts, the trail cadence and the exhaust bursts all kept
// their pre-rebase times. This receipt names none of them. It drives a live runtime (fx/effects.ts) with its clock at a
// time no other number in the runtime has (T0), rebases the clock to 0 (the Studio's reset at every load and seek), and
// then walks everything the runtime can reach: its objects, arrays, maps, typed arrays, and the variables every closure of
// a src/ module holds (through node:inspector, the same view a debugger has). Any number still within the scenario's span
// of T0 is a stamp the rebase did not move, and the receipt fails naming where it lives (file, closure, variable). A new
// stamp a part keeps without registering its shift fails it the first time this scenario reaches it.
//
// The control: the same walk before the rebase finds the runtime's live stamps (it sees into closures at all).
import assert from 'node:assert/strict';
import { Session } from 'node:inspector';
import { createRequire } from 'node:module';
import * as THREE from 'three';
import { createFx } from './effects.ts';
import { fxClockNow } from './clock.ts';

const require = createRequire(import.meta.url);
const { createCanvas } = require('@napi-rs/canvas');
globalThis.document ??= { createElement: () => createCanvas(1, 1) };

/** the scenario's clock: no other number the runtime holds lies within SPAN of it */
const T0 = 7_777_777;
const SPAN = 4000;
const SELF = import.meta.url;

// ---- a live runtime, every stamping path the scenario reaches ----
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.5, 5000);
camera.position.set(0, 3, -40); camera.lookAt(0, 2, 0); camera.updateMatrixWorld(true);
// sand under the tracks (the media tier's skirt), a building's damage seam for the wall strikes
const heightField = { getHeightAt: () => 0, getNormalAt: () => new THREE.Vector3(0, 1, 0), getTrackSurfaceAt: () => 2,
  getGroundType: () => 'medium', addWaterImpulse() {} };
const world = { structureDamage: () => null, clearCoverAt() {} };
const fx = createFx({ scene, camera, renderer: null, anisotropy: 1, setupShadowMaterial: () => {}, releaseShadowMaterial: () => {} },
  heightField, { seed: 5, world: () => world });
scene.add(fx.group);
const handlers = new Map();
fx.bindBus({ on(n, f) { (handlers.get(n) ?? handlers.set(n, []).get(n)).push(f); return () => {}; } });
const emit = (n, p) => { for (const f of handlers.get(n) ?? []) f(p); };
const frames = (n, shells = []) => { for (let i = 0; i < n; i++) fx.update(1 / 60, shells, camera, () => null); };
const he = { shellType: 'HE', caliberMm: 125, munition: 'he', chargeKg: 3.4 };
let id = 9000;
const fired = (shellId) => emit('shell:fired', { shellId, shooterId: 'g', pos: [0, 30, -60], muzzlePos: [0, 30, -60], dir: [0, -0.4, 0.9],
  shellName: '125 mm HE', ...he });
const groundBurst = (x) => { const s = id++; fired(s); emit('shell:expired', { shellId: s, pos: [x, 0, 0], hitTerrain: true, ...he }); };
const shells = [
  { id: 71, pos: new THREE.Vector3(0, 2, 10), vel: new THREE.Vector3(0, 0, 1500), spec: { tracer: 'TANK' }, shooterId: 'g', ageS: 0.05, distM: 60 },
  { id: 72, pos: new THREE.Vector3(4, 3, 20), vel: new THREE.Vector3(0, 0, 250), spec: { guided: true, tracer: 'ATGM' }, shooterId: 'g', ageS: 1, distM: 250 },
];

fx.resetClock(T0);
frames(3);
// an engine running 2.5 s (past the cold start), then a throttle-up: its billow burst
const stack = new THREE.Vector3(5, 2, 0), vel = new THREE.Vector3(0, 0, 6), fwd = new THREE.Vector3(0, 0, 1);
const track = new THREE.Vector3(), dir = new THREE.Vector3(0, 0, 1);
for (let f = 0; f < 170; f++) {
  const z = f * 0.1;
  stack.set(5, 2, z); track.set(6, 0, z);
  fx.exhaust(stack, f < 150 ? 0.2 : 1, false, vel, fwd);
  fx.dust(track, dir, 1);
  frames(1, f > 120 ? shells : []);
}
// a salvo's bursts on the ground, and rounds striking a building's wall
for (let k = 0; k < 3; k++) { groundBurst(k * 3); frames(2); }
for (let k = 0; k < 2; k++) {
  const s = id++; fired(s);
  emit('shell:expired', { shellId: s, pos: [0, 1.5, 3], hitTerrain: false, hitKind: 'prop', structureId: 7, normal: [0, 0, -1], ...he });
  frames(2);
}
// the moment of the rebase: a burst just drawn (its records live) and a hull event waiting for its round's expiry
groundBurst(20);
{
  const s = id++; fired(s);
  emit('shell:hit', { shellId: s, attackerId: 'g', targetId: 't', kind: 'he_splash', damage: 40, pos: [1, 0.8, 0], normal: [0, 1, 0],
    caliberMm: 125, shellType: 'HE', destroyed: false });
}
const scenarioEnd = fxClockNow();
assert.ok(scenarioEnd - T0 < SPAN / 2, `the scenario stays inside the census span (${(scenarioEnd - T0).toFixed(2)} s)`);

// ---- the census ----
const session = new Session();
session.connect();
const call = (method, params = {}) => {
  let out, err;
  session.post(method, params, (e, r) => { err = e; out = r; });
  if (err) throw err;
  if (!out) throw new Error(`inspector ${method} answered asynchronously`);
  return out;
};
const urls = new Map();
session.on('Debugger.scriptParsed', (m) => urls.set(m.params.scriptId, m.params.url));
call('Debugger.enable');
let sink = null;
globalThis.__fxStampCensusSink = (x) => { sink = x; };

/** every number reachable from `root` within SPAN of T0, by where it lives */
function census(root) {
  const hits = new Map();
  const seen = new Set([globalThis, process, console, session]);
  const queue = [];
  const push = (x, at) => {
    if (x !== null && (typeof x === 'object' || typeof x === 'function') && !seen.has(x)) { seen.add(x); queue.push([x, at]); }
  };
  const stamp = (x, at) => { if (typeof x === 'number' && Math.abs(x - T0) < SPAN && !hits.has(at)) hits.set(at, x); };
  function closures(fn, at) {
    globalThis.__fxStampCensusFn = fn;
    const fid = call('Runtime.evaluate', { expression: 'globalThis.__fxStampCensusFn', objectGroup: 'census' }).result.objectId;
    const internal = call('Runtime.getProperties', { objectId: fid, ownProperties: true, objectGroup: 'census' }).internalProperties ?? [];
    const loc = internal.find((p) => p.name === '[[FunctionLocation]]')?.value?.value;
    const url = loc ? urls.get(loc.scriptId) ?? '' : '';
    // the game's own modules (node_modules, node's internals and this receipt are not the runtime's state)
    if (!url.includes('/src/') || url === SELF) return;
    const list = internal.find((p) => p.name === '[[Scopes]]');
    if (!list) return;
    call('Runtime.callFunctionOn', { objectId: list.value.objectId, objectGroup: 'census',
      functionDeclaration: 'function () { globalThis.__fxStampCensusSink(Array.from(this)); }' });
    const file = url.slice(url.lastIndexOf('/src/') + 1);
    for (const scope of sink) {
      const kind = String(scope.description);
      if (/^(Global|Script)/.test(kind)) continue;
      // a module's own top-level state, for the fx modules (another module's is its own, not the runtime's)
      const moduleScope = /^Module/.test(kind);
      if (moduleScope && !url.includes('/src/fx/')) continue;
      const vars = scope.object;
      for (const name of Object.keys(vars)) {
        const x = vars[name];
        const where = `${file}:${loc.lineNumber + 1} ${kind} ${name}`;
        stamp(x, where);
        if (moduleScope && typeof x === 'function') continue; // an import: its own module's
        push(x, where);
      }
    }
  }
  push(root, 'fx');
  while (queue.length) {
    const [x, at] = queue.pop();
    if (typeof x === 'function') { closures(x, at); continue; }
    if (ArrayBuffer.isView(x)) {
      if (x instanceof DataView) continue;
      for (let i = 0; i < x.length; i++) {
        const v = x[i];
        if (typeof v === 'number' && Math.abs(v - T0) < SPAN) { stamp(v, `${at}[${i}]`); break; }
      }
      continue;
    }
    if (x instanceof Map) { for (const [k, y] of x) { stamp(y, `${at}.get(${String(k)})`); push(k, `${at}.key`); push(y, `${at}.get(${String(k)})`); } continue; }
    if (x instanceof Set) { for (const y of x) { stamp(y, `${at}.has`); push(y, `${at}.has`); } continue; }
    if (x instanceof WeakMap || x instanceof WeakSet || x instanceof Promise || x instanceof WeakRef) continue;
    for (const key of Reflect.ownKeys(x)) {
      const desc = Object.getOwnPropertyDescriptor(x, key);
      if (!desc || !('value' in desc)) continue; // never run an accessor
      const at2 = `${at}.${String(key)}`;
      stamp(desc.value, at2);
      push(desc.value, at2);
    }
  }
  call('Runtime.releaseObjectGroup', { objectGroup: 'census' });
  return { hits, values: seen.size };
}

// the control: before the rebase the walk finds the live stamps, inside closures and out
const before = census(fx);
const files = new Set([...before.hits.keys()].map((at) => at.split(':')[0]));
assert.ok(before.hits.size >= 12 && files.size >= 5,
  `the census sees the runtime's live stamps (${before.hits.size} in ${files.size} files: ${[...files].join(', ')})`);

// the rebase: the Studio's reset to 0, then a frame (per-frame mirrors of the clock take the new one)
fx.resetClock(0);
frames(2);
const after = census(fx);
assert.ok(after.values > 1000, `the walk reached the runtime (${after.values} values)`);
const left = [...after.hits].map(([at, x]) => `  ${at} = ${x}`);
assert.equal(left.length, 0, `stamps the rebase left at their pre-rebase time (register each part's shift where it is made, timeShift.ts):\n${left.join('\n')}`);

session.disconnect();
fx.resetAll();
console.log(`fxClockStampCensus.selftest: a rebase moves every fx-clock stamp the runtime holds (${before.hits.size} live before it, none left after; ${after.values} values walked)`);
