// Round 2 (2026-11-03 critic U31, U33): one HE round's records on the real runtime (fx/effects.ts), the two that round
// one left open after its one-burst-a-round fix:
//  - the records survive a battle's other rounds: every expiry was noted and the maps were cleared past 256 entries, so a
//    burst of small-arms strikes between an HE round's expiry and its late hull event dropped the round's record and it
//    burst twice. Only a charged round is recorded now, and an overflow drops the oldest record, never the map;
//  - a terrain expiry later than its hull's burst keeps the ground's own marks: it returned before the ground hit, so the
//    burst's crater mark, the cover it clears and the water's ring were lost, and the last blast's crater record stood
//    (a later burst beside it read as dug and left no mark);
//  - a clock rebase inside a round's wait moves its records and its waiting hull event (timeShift.ts): a forward pin drew
//    the hull's burst already aged (none to see) and let the round's other event draw a second one.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as THREE from 'three';
import { createFx } from './effects.ts';
import { fxClockNow } from './clock.ts';

const require = createRequire(import.meta.url);
const { createCanvas } = require('@napi-rs/canvas');
globalThis.document ??= { createElement: () => createCanvas(1, 1) };

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.5, 5000);
camera.position.set(0, 3, -40); camera.lookAt(0, 2, 0); camera.updateMatrixWorld(true);
const counts = { cover: 0, water: 0 };
const world = { structureDamage: () => null, clearCoverAt: () => { counts.cover++; } };
const fx = createFx({ scene, camera, renderer: null, anisotropy: 1, setupShadowMaterial: () => {}, releaseShadowMaterial: () => {} },
  { getHeightAt: () => 0, getNormalAt: () => new THREE.Vector3(0, 1, 0), addWaterImpulse: () => { counts.water++; } },
  { seed: 5, world: () => world });
scene.add(fx.group);
const handlers = new Map();
fx.bindBus({ on(n, f) { (handlers.get(n) ?? handlers.set(n, []).get(n)).push(f); return () => {}; } });
const emit = (n, p) => { for (const f of handlers.get(n) ?? []) f(p); };
const frames = (n, dt = 1 / 60) => { for (let i = 0; i < n; i++) fx.update(dt, [], camera, () => null); };
const bodies = () => fx.group.getObjectByName('fx-volume-media').children[0].geometry.instanceCount;
// the bodies born round the HE round's point (a machine gun's strikes below lie 30 m off)
const bodiesHere = () => {
  const geo = fx.group.getObjectByName('fx-volume-media').children[0].geometry;
  const pb = geo.attributes.aPB.array;
  let n = 0;
  for (let i = 0; i < geo.instanceCount; i++) if (Math.abs(pb[i * 4]) < 15 && Math.abs(pb[i * 4 + 2]) < 15) n++;
  return n;
};
const marks = () => fx.group.getObjectByName('fx-crater-marks').geometry.drawRange.count;
const near = (a, b, tol = 6) => Math.abs(a - b) <= tol;
const he = { shellType: 'HE', caliberMm: 125, munition: 'he', chargeKg: 3.4 };
let id = 300;
const fired = (shellId) => emit('shell:fired', { shellId, shooterId: 'g', pos: [0, 30, -60], muzzlePos: [0, 30, -60], dir: [0, -0.4, 0.9],
  shellName: '125 mm HE', ...he });
const hit = (shellId) => emit('shell:hit', { shellId, attackerId: 'g', targetId: 't', kind: 'he_splash', damage: 40, pos: [1, 0.8, 0],
  normal: [0, 1, 0], caliberMm: 125, shellType: 'HE', destroyed: false });
const expired = (shellId, extra = {}) => emit('shell:expired', { shellId, pos: [0, 0, 0], hitTerrain: true, ...he, ...extra });
// a machine gun's rounds striking the ground (each one a strike of its own: no record of any HE round's)
const smallArms = (n) => {
  for (let k = 0; k < n; k++) emit('shell:expired', { shellId: 5000 + id * 1000 + k, pos: [30 + (k % 20), 0, 20 + Math.floor(k / 20)],
    hitTerrain: true, shellType: 'AP', caliberMm: 7.62, munition: 'small_arms', chargeKg: 0 });
};
const run = (script) => { fx.resetAll(); frames(2); const shellId = id++; fired(shellId); return script(shellId); };

// ---- the records survive the battle's other rounds ----
{
  // one burst on the ground (its expiry first, a peer's late hull event after): the bodies round the round's point
  const here = (flood) => run((s) => {
    expired(s); frames(2);
    if (flood) smallArms(300);
    frames(1);
    hit(s); frames(10);
    return bodiesHere();
  });
  const quiet = here(false);
  const crowded = here(true);
  assert.ok(quiet > 60, `the round's burst (${quiet} bodies)`);
  assert.ok(near(crowded, quiet), `a hull event after 300 small-arms strikes still reads as fragments (${crowded} bodies vs ${quiet}; a plate burst adds ~25)`);
}

// ---- a terrain expiry later than its hull's burst keeps the ground's marks ----
{
  // the hull's wait runs out (its burst drawn at the hull), then the ground expiry lands
  const late = (extra) => run((s) => { hit(s); frames(10); counts.cover = 0; counts.water = 0; expired(s, extra); frames(2);
    return { marks: marks(), cover: counts.cover, water: counts.water }; });
  const ground = late({});
  assert.ok(ground.marks > 0, `the late ground expiry leaves its crater mark (draw range ${ground.marks})`);
  assert.ok(ground.cover > 0, 'and clears the cover round it');
  const water = late({ hitWater: true });
  assert.ok(water.water > 0, 'a late water expiry still rings the water');
  // a late expiry whose blast dug a crater (the core's terrain:crater event marks it): the next burst beside it is no dig
  const next = run((s) => {
    hit(s); frames(10);
    emit('munition:blast', { munition: 'he', chargeKg: 3.4, x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0, surface: 'ground', craterId: 5 });
    expired(s); frames(2);
    const dugMarks = marks();
    const second = id++;
    fired(second); expired(second); frames(2);
    return { dugMarks, after: marks() };
  });
  assert.equal(next.dugMarks, 0, 'a dug crater leaves the mark to its own event');
  assert.ok(next.after > 0, `the next burst beside it leaves its own mark (the late expiry let the crater record go; ${next.after})`);
}

// ---- a rebase inside a round's wait ----
{
  const sameFrame = run((s) => { hit(s); expired(s); frames(12); return bodies(); });
  assert.ok(sameFrame > 60, `a ground burst draws its bodies (${sameFrame})`);
  // the hull event waits for its expiry; a forward pin (a capture's, 500 s on) lands inside the wait
  const pinned = run((s) => { hit(s); fx.resetClock(fxClockNow() + 500); frames(2); expired(s); frames(12); return bodies(); });
  assert.ok(near(pinned, sameFrame, 8), `a forward pin inside the wait: one burst, at its own age (${pinned} vs ${sameFrame})`);
  // the expiry burst first, a pin, then the round's late hull event
  const after = run((s) => { expired(s); frames(2); fx.resetClock(fxClockNow() + 500); frames(1); hit(s); frames(12); return bodies(); });
  assert.ok(near(after, sameFrame, 8), `a forward pin after the burst: the hull event is fragments, not a second burst (${after} vs ${sameFrame})`);
  // the Studio's reset to 0 inside a wait
  const reset = run((s) => { frames(30); hit(s); fx.resetClock(0); frames(2); expired(s); frames(12); return bodies(); });
  assert.ok(near(reset, sameFrame, 8), `a reset to 0 inside the wait: one burst (${reset} vs ${sameFrame})`);
}

fx.resetAll();
console.log('heRoundRecords.selftest: an HE round keeps its records through a battle\'s other rounds and a clock rebase; a late ground expiry keeps its marks');
