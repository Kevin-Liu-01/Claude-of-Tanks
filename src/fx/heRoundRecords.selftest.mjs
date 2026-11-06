// Round 2 (2026-11-03 critic U31, U33): one HE round's records on the real runtime (fx/effects.ts), the two that round
// one left open after its one-burst-a-round fix:
//  - the records survive a battle's other rounds: every expiry was noted and the maps were cleared past 256 entries, so a
//    burst of small-arms strikes between an HE round's expiry and its late hull event dropped the round's record and it
//    burst twice. An overflow drops the oldest record now, never the map;
//  - (round 2 U31 review) every round's end is recorded, whatever FX makes of its charge: the sim raises hull events by
//    its HE class (damage.ts isHeClass), and a WP smoke round (HE class, no charge) recorded as a charged round only drew
//    a plate burst at its he_splash. A round FX knows is uncharged strikes each hull as fragments, never a blast, on every
//    order of its events; a Studio stand-in (-1) is no round, and each burst of a barrage draws; the fired records drop
//    the oldest past their cap (cleared past 96, a smoke round in flight lost its class and burst as HE); a late expiry's
//    mark is its round's class;
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
// the fire puffs drawn since the last reset (the fire pool, the one at renderOrder 22: particles.ts): a blast's flash and
// fire; fragments and a kinetic strike draw none
const fires = () => fx.group.getObjectByName('fx-particles').children.find((m) => m.renderOrder === 22).geometry.instanceCount;
// the kinds of the crater marks on the ground (craterMarks.ts aInfo: birth, surface, kind, seed per vertex)
const markKinds = () => {
  const a = fx.group.getObjectByName('fx-crater-marks').geometry.attributes.aInfo.array;
  const kinds = new Set();
  for (let q = 0; q < a.length; q += 4) if (a[q] > -1e8) kinds.add(a[q + 2]);
  return [...kinds].sort();
};
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

// ---- (round 2 U31 review) every round is recorded, whatever FX makes of its charge ----
{
  // L34 WP Smoke (challengerSpecs.ts): typed HE, so HE class in the sim (its he_splash comes), 'smoke' in FX (no charge);
  // an L31 HESH, typed HE too, as the charged control. A hull 6 m off the burst point.
  const smoke = { shellType: 'HE', caliberMm: 120, shellName: 'L34 WP Smoke' };
  const hesh = { shellType: 'HE', caliberMm: 120, shellName: 'L31 HESH' };
  const fireAt = (s, spec) => emit('shell:fired', { shellId: s, shooterId: 'g', pos: [0, 30, -60], muzzlePos: [0, 30, -60],
    dir: [0, -0.4, 0.9], ...spec });
  const hullHit = (s, spec) => emit('shell:hit', { shellId: s, attackerId: 'g', targetId: 't', kind: 'he_splash', damage: 5,
    pos: [6, 1.2, 0], normal: [-1, 0, 0], caliberMm: spec.caliberMm, shellType: spec.shellType, destroyed: false });
  // as the solo step and a peer raise it: its type and calibre, no class of its own
  const groundEnd = (s, spec) => emit('shell:expired', { shellId: s, pos: [0, 0, 0], hitTerrain: true, hitKind: 'terrain',
    shellType: spec.shellType, caliberMm: spec.caliberMm });
  // the fire puffs the round's end draws (its muzzle's are drawn before)
  const endFires = (spec, script) => {
    fx.resetAll(); frames(2);
    const s = id++;
    fireAt(s, spec); frames(1);
    const before = fires();
    script(s); frames(20);
    return fires() - before;
  };
  assert.ok(endFires(hesh, (s) => { hullHit(s, hesh); groundEnd(s, hesh); }) > 0, 'control: a charged round\'s end draws its burst');
  // the sim's order, in one frame: on 61ba7d87c5 the he_splash found no record and drew a plate burst
  assert.equal(endFires(smoke, (s) => { hullHit(s, smoke); groundEnd(s, smoke); }), 0,
    'a WP smoke round\'s he_splash and ground expiry in one frame: fragments on the hull, no plate burst');
  assert.equal(endFires(smoke, (s) => { groundEnd(s, smoke); frames(3); hullHit(s, smoke); }), 0,
    'a smoke round\'s hull event after its expiry (a peer\'s queue): fragments');
  // on 50197fdf43 too: the wait ran out, and the hull event drew the round's burst
  assert.equal(endFires(smoke, (s) => { hullHit(s, smoke); frames(10); groundEnd(s, smoke); }), 0,
    'a smoke round\'s expiry later than its hull\'s wait: fragments, no plate burst');
  assert.equal(endFires(smoke, (s) => { hullHit(s, smoke); }), 0, 'a smoke round on a hull (no expiry): fragments, no plate burst');
  // the fired records past their old cap of 96: a heavy fight's machine guns fire 120 rounds while the smoke round flies
  // (the bodies round the smoke round's point: the guns' muzzles lie 55 m off, and fill the fire pool)
  const smokeEnd = (guns) => {
    fx.resetAll(); frames(2);
    const s = id++;
    fireAt(s, smoke);
    for (let k = 0; k < guns; k++) {
      emit('shell:fired', { shellId: 700000 + id * 1000 + k, shooterId: 'mg', pos: [40, 2, 40], muzzlePos: [40, 2, 40], dir: [1, 0, 0],
        shellType: 'AP', caliberMm: 7.62, shellName: '7.62 mm' });
    }
    frames(1);
    groundEnd(s, smoke); frames(6);
    return bodiesHere();
  };
  const quietSmoke = smokeEnd(0), crowdedSmoke = smokeEnd(120);
  assert.ok(near(crowdedSmoke, quietSmoke), `a smoke round's class outlasts 120 rounds fired in its flight (${crowdedSmoke} bodies at its point vs ${quietSmoke}; an HE burst by its type draws ~60)`);
  // (round 3 B4) a hull's kinetic hit ends its round with no expiry: its fired record leaves the records of rounds in
  // flight (it waited for drop-oldest at 256, so a sustained fight held the map at its cap and a long-flight round
  // fired before 256 such hits lost its class, its expiry bursting as HE by its type)
  const hullFight = (hits) => {
    fx.resetAll(); frames(2);
    const s = id++;
    fireAt(s, smoke);
    for (let k = 0; k < hits; k++) {
      const round = 800000 + id * 1000 + k;
      emit('shell:fired', { shellId: round, shooterId: 'ac', pos: [40, 2, 40], muzzlePos: [40, 2, 40], dir: [1, 0, 0],
        shellType: 'APFSDS', caliberMm: 30, shellName: '30 mm APFSDS-T' });
      emit('shell:hit', { shellId: round, attackerId: 'ac', targetId: 't2', kind: k % 3 ? 'nonpen' : 'pen', damage: 4,
        pos: [44, 1, 40], normal: [-1, 0, 0], caliberMm: 30, shellType: 'APFSDS', destroyed: false });
    }
    frames(1);
    groundEnd(s, smoke); frames(6);
    return bodiesHere();
  };
  const foughtSmoke = hullFight(300);
  assert.ok(near(foughtSmoke, quietSmoke),
    `a smoke round's class outlasts 300 kinetic hull hits in its flight (${foughtSmoke} bodies at its point vs ${quietSmoke})`);
  // a kinetic round that carries through a hull (sim/damage.ts resolveCarryThrough) and ends on the ground still reads its
  // own class there: a 30 mm HEI typed AP is an autocannon HE round by its name, an AP strike by its type alone
  const heiEnd = (throughHull) => {
    fx.resetAll(); frames(2);
    const s = id++;
    emit('shell:fired', { shellId: s, shooterId: 'ac', pos: [0, 2, -40], muzzlePos: [0, 2, -40], dir: [0, 0, 1],
      shellType: 'AP', caliberMm: 30, shellName: '30 mm HEI-T' });
    frames(1);
    const before = fires();
    if (throughHull) {
      emit('shell:hit', { shellId: s, attackerId: 'ac', targetId: 't3', kind: 'pen', damage: 6, pos: [0, 1, -10],
        normal: [0, 0, -1], caliberMm: 30, shellType: 'AP', destroyed: false });
    }
    frames(1);
    const atHull = fires() - before;
    emit('shell:expired', { shellId: s, pos: [0, 0, 0], hitTerrain: true, hitKind: 'terrain', shellType: 'AP', caliberMm: 30 });
    frames(6);
    return fires() - before - atHull;
  };
  const heiGround = heiEnd(false);
  assert.ok(heiGround > 0, `control: a 30 mm HEI's ground strike draws its burst (${heiGround} fire puffs)`);
  assert.equal(heiEnd(true), heiGround, 'a 30 mm HEI that carried through a hull bursts on the ground by its own class');
  // a late expiry's mark is its round's class: an L31 HESH's scorch, as on time, not an HE crater guessed from its type
  const kindsOf = (late) => {
    fx.resetAll(); frames(2);
    const s = id++;
    fireAt(s, hesh);
    if (late) { hullHit(s, hesh); frames(10); }
    groundEnd(s, hesh); frames(2);
    return markKinds();
  };
  const onTime = kindsOf(false);
  assert.equal(onTime.length, 1, `an on-time HESH expiry leaves one kind of mark (${onTime})`);
  assert.deepEqual(kindsOf(true), onTime, 'a late HESH expiry leaves the same mark as on time');
  // the Studio's small barrage (studio.ts fireExplosion): its stand-in bursts all carry shell id -1 in one call
  const barrage = (n) => {
    fx.resetAll(); frames(2);
    for (let k = 0; k < n; k++) emit('shell:expired', { shellId: -1, hitTerrain: true, pos: [k * 12 - 30, 0, 10] });
    frames(6);
    return fires();
  };
  const one = barrage(1), six = barrage(6);
  assert.ok(one > 0, `a stand-in burst draws its fire (${one})`);
  assert.ok(six >= 5 * one, `each of a barrage's six stand-in bursts draws (${six} fire puffs vs ${one} for one)`);
}

fx.resetAll();
console.log('heRoundRecords.selftest: an HE round keeps its records through a battle\'s other rounds and a clock rebase; a late ground expiry keeps its marks; every round is recorded and an uncharged one never bursts');
