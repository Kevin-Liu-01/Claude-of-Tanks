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
//    the hull's burst already aged (none to see) and let the round's other event draw a second one;
//  - (round 4 F6) a round that ends on a ricochet leaves the records of rounds in flight at that end, and a round whose end
//    never comes (a peer's withheld or lost end event) ages out of the records by its flight-time bound, not drop-oldest;
//    (review r1) a round still drawn in flight keeps its record through a stall of its events longer than that bound, a
//    record moving maps keeps the sweeps a second apart, and the phone tier (no volume media, so no plate burst forgets a
//    shaped charge's record) leaves no shaped charge ended on a ricochet among the rounds in flight;
//  - (round 5 U11) a round's record keeps its grace after the round's last drawn frame, however long the round was drawn:
//    renewed only at a sweep, it lapsed in the sweep one frame after that frame, before the end event trailing it.
//    (round 6 V1) For a round drawn past its 6 s flight bound (a round drawn shorter keeps its record to its firing's
//    10 s bound), an end trailing that frame by a frame or by 235 frames (3.92 s) keeps the class, and one trailing it
//    315 frames, past the 4 s grace and a sweep's 1 s spacing, finds the record gone: the renewal is held between 3.92 s
//    and 5.25 s, not to one frame of it. (review r1) In either map: a round that carried through a hull and flies on
//    keeps its hull-met record so. And a dead round, which the Studio hands each frame until its timeline resets, renews
//    no record of a round in flight (the Studio's hull events carry no shell id, so none of its rounds holds a hull-met
//    one). (review r2) The renewal only raises a due time: a round drawn 1 s whose end comes 5 s after that frame keeps
//    its record to its firing's bound through another record's sweep between; (review r3) its ground end (the round cut
//    past the snapshot's round cap) and its hull event (its shooter out of sight) alike, each the end its path delivers.
import assert from 'node:assert/strict';
import { Session } from 'node:inspector';
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
/** (round 4 F6) how many round records a runtime holds, read from its own closure (node:inspector, a debugger's view):
 *  the records of rounds in flight and of rounds that met a hull (effects.ts shellMunitions, hullMetMunitions), and when
 *  its next sweep of them runs (shellRecordsDueS) */
function recordState(runtime = fx) {
  const session = new Session();
  session.connect();
  const post = (method, params) => {
    let out, err;
    session.post(method, params, (e, r) => { err = e; out = r; });
    if (err) throw err;
    return out;
  };
  try {
    globalThis.__heRecordsFn = runtime.update;
    const fid = post('Runtime.evaluate', { expression: 'globalThis.__heRecordsFn' }).result.objectId;
    const internal = post('Runtime.getProperties', { objectId: fid, ownProperties: true }).internalProperties ?? [];
    const scopes = internal.find((p) => p.name === '[[Scopes]]');
    let vars = null;
    globalThis.__heRecordsSink = (list) => { vars = list.map((s) => s.object).find((o) => o && o.shellMunitions instanceof Map) ?? null; };
    post('Runtime.callFunctionOn', { objectId: scopes.value.objectId,
      functionDeclaration: 'function () { globalThis.__heRecordsSink(Array.from(this)); }' });
    assert.ok(vars, 'the runtime\'s round records are in fx.update\'s closure');
    return { inFlight: vars.shellMunitions.size, hullMet: vars.hullMetMunitions.size, sweepAt: vars.shellRecordsDueS };
  } finally {
    session.disconnect();
    delete globalThis.__heRecordsFn;
    delete globalThis.__heRecordsSink;
  }
}
/** the record counts alone */
const recordCounts = (runtime = fx) => { const { inFlight, hullMet } = recordState(runtime); return { inFlight, hullMet }; };
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
  // (round 4 F6) a round that ends on a ricochet raises no expiry (state.ts stepLiveShell emits none after a hull impact):
  // the sim kills a shaped charge at its first ricochet and any round at its second (damage.ts RICOCHET_MAX_BOUNCES), so
  // the ricochet is its last event. It skipped the move out of the records of rounds in flight and waited there for
  // drop-oldest at 256, so a sustained fight's double ricochets crowded a long-flight round's class out again
  const ricochetFight = (rounds, type, bounces) => {
    fx.resetAll(); frames(2);
    const s = id++;
    fireAt(s, smoke);
    for (let k = 0; k < rounds; k++) {
      const round = 900000 + id * 1000 + k;
      emit('shell:fired', { shellId: round, shooterId: 'ac', pos: [40, 2, 40], muzzlePos: [40, 2, 40], dir: [1, 0, 0],
        shellType: type, caliberMm: 30, shellName: `30 mm ${type}` });
      for (let b = 0; b < bounces; b++) {
        emit('shell:hit', { shellId: round, attackerId: 'ac', targetId: 't2', kind: 'ricochet', damage: 0, pos: [44, 1, 40 + b],
          normal: [-1, 0, 0], caliberMm: 30, shellType: type, destroyed: false });
      }
    }
    frames(1);
    groundEnd(s, smoke); frames(6);
    return bodiesHere();
  };
  const bouncedSmoke = ricochetFight(300, 'APFSDS', 2);
  assert.ok(near(bouncedSmoke, quietSmoke),
    `a smoke round's class outlasts 300 rounds ended on their second ricochet in its flight (${bouncedSmoke} bodies at its point vs ${quietSmoke})`);
  const jetSmoke = ricochetFight(300, 'HEAT', 1);
  assert.ok(near(jetSmoke, quietSmoke),
    `a smoke round's class outlasts 300 shaped charges ended on a ricochet in its flight (${jetSmoke} bodies at its point vs ${quietSmoke})`);
  // (round 4 F6) a round whose end never comes: a peer's shell_impact is withheld once its shooter leaves this viewer's
  // sight (authoritativeMatch canObserveEvent), and a round in flight when its host went has none. Its record ages out by
  // the round's flight-time bound (the sim ends every fired round by sim/ballistics.ts SHELL_MAX_LIFETIME_S), not by
  // drop-oldest at 256, and so do the hull-met records (a kinetic hull hit has no expiry either)
  {
    fx.resetAll(); frames(2);
    for (let k = 0; k < 300; k++) {
      const round = 950000 + k;
      emit('shell:fired', { shellId: round, shooterId: 'mg', pos: [40, 2, 40], muzzlePos: [40, 2, 40], dir: [1, 0, 0],
        shellType: 'AP', caliberMm: 12.7, shellName: '12.7 mm' });
      if (k % 2) {
        emit('shell:hit', { shellId: round, attackerId: 'mg', targetId: 't2', kind: 'nonpen', damage: 0, pos: [44, 1, 40],
          normal: [-1, 0, 0], caliberMm: 12.7, shellType: 'AP', destroyed: false });
      }
    }
    frames(1);
    const held = recordCounts();
    assert.ok(held.inFlight > 100 && held.hullMet > 100, `the rounds are on record (${JSON.stringify(held)})`);
    // the rounds' flight-time bound and its grace pass on the fx clock (12 s, half-second frames)
    frames(24, 0.5);
    const aged = recordCounts();
    assert.deepEqual(aged, { inFlight: 0, hullMet: 0 },
      `rounds whose end never came leave the records by their flight-time bound, not at drop-oldest (${JSON.stringify(aged)} left)`);
  }
  // (round 4 F6 review) the fx clock runs on render time: in a network view it keeps running while a peer's events stall
  // (a link hitch, a HOLD, a host handover), and the frame still draws the round in flight as its last snapshot left it
  // (battlePresentation applyShells). A round drawn in flight keeps its record however late its end comes; its record
  // had aged out 10 s after its firing, and the smoke round's late expiry burst as HE by its type
  {
    fx.resetAll(); frames(2);
    const s = id++;
    fireAt(s, smoke);
    const round = { id: s, shooterId: 'g', pos: new THREE.Vector3(0, 12, -30), prevPos: new THREE.Vector3(0, 12.2, -31),
      vel: new THREE.Vector3(0, -4, 60), spec: { tracer: 'TANK' }, ageS: 0.5, distM: 30 };
    for (let k = 0; k < 40; k++) fx.update(0.5, [round], camera, () => null);
    groundEnd(s, smoke); frames(6);
    const stalledSmoke = bodiesHere();
    assert.ok(near(stalledSmoke, quietSmoke),
      `a smoke round drawn in flight through a 20 s stall of its events keeps its class (${stalledSmoke} bodies at its point vs ${quietSmoke})`);
  }
  // (round 5 U11) the grace runs from the round's last drawn frame: its end event trails the snapshot that drops the
  // round by a frame or more (a peer's queue releases a stalled end a few frames on: mp/match/events.ts). A round drawn
  // 9.99 s through a stall (its record due 10 s after its firing, no sweep since) or 19.99 s (renewed at the sweep at
  // 10 s, due at 20 s) lost its record in the sweep one frame after its last drawn frame, before its end: an HE burst.
  // (round 6 V1) The end trails by one frame and by 235 frames (3.92 s), most of the 4 s grace: a renewal that kept the
  // record 0.05 s, 0.1 s or a sweep's spacing past the frame passed the one-frame case alone. And the grace is a bound:
  // an end trailing past it and a sweep's spacing finds the record gone and draws by its type, so the class the shorter
  // trails keep is the record's. (review r1) That is the most a record outlives the last drawn frame of a round drawn past
  // its flight bound (SHELL_MAX_LIFETIME_S, 6 s), as both here are: a round drawn shorter keeps its record to its firing's
  // bound (effects.ts SHELL_RECORD_BOUND_S, 10 s after it), later than the grace. In both, a sweep comes due with the
  // renewed record, so a renewal shorter than 3.92 s or longer than 5.25 s fails here
  const drawnRound = (drawnS) => {
    fx.resetAll(); frames(2);
    const s = id++;
    fireAt(s, smoke);
    const t0 = fxClockNow();
    const round = { id: s, shooterId: 'g', pos: new THREE.Vector3(0, 12, -30), prevPos: new THREE.Vector3(0, 12.2, -31),
      vel: new THREE.Vector3(0, -4, 60), spec: { tracer: 'TANK' }, ageS: 0.5, distM: 30 };
    for (let k = 0; k < 100 && fxClockNow() - t0 < drawnS - 1e-9; k++) {
      fx.update(Math.min(0.5, drawnS - (fxClockNow() - t0)), [round], camera, () => null);
    }
    assert.ok(Math.abs(fxClockNow() - t0 - drawnS) < 1e-6, `the round is drawn for ${drawnS} s`);
    return s;
  };
  for (const drawnS of [9.99, 19.99]) {
    for (const trailFrames of [1, 235]) {
      const s = drawnRound(drawnS);
      frames(trailFrames); // the snapshot that drops the round, and the frames its end trails it by
      groundEnd(s, smoke); frames(6);
      const trailing = bodiesHere();
      assert.ok(near(trailing, quietSmoke),
        `a smoke round drawn ${drawnS} s whose end trails its last drawn frame by ${trailFrames} frame(s) keeps its class (${trailing} bodies at its point vs ${quietSmoke})`);
    }
    // past the grace and a sweep's spacing (a sweep may come up to a spacing after the record falls due), and 15 frames
    const pastFrames = (4 + 1) * 60 + 15;
    const s = drawnRound(drawnS);
    frames(pastFrames);
    const left = recordCounts();
    assert.deepEqual(left, { inFlight: 0, hullMet: 0 },
      `a smoke round drawn ${drawnS} s leaves the records by the grace and a sweep's spacing after its last drawn frame (${JSON.stringify(left)} after ${pastFrames} frames)`);
    groundEnd(s, smoke); frames(6);
    const typed = bodiesHere();
    assert.ok(typed > quietSmoke + 30,
      `and its end ${pastFrames} frames on draws by its type, so the class kept above is the record's (${typed} bodies at its point vs ${quietSmoke})`);
  }
  // (round 6 V1 review r2) the renewal only raises a record's due time. A round drawn 1 s and then dropped from the frame
  // ends 5 s after its last drawn frame, 6 s into its flight: its record is due at its firing's bound, 10 s on, and the
  // sweep between, due for a machine gun's round fired 4.5 s before it whose end never came, leaves it. A renewal that set
  // the due time outright lowered it to the last drawn frame and the grace, and that sweep took it: the smoke round's end
  // took its class from its type. (review r3) Each end as a viewer receives it on the path that dropped the round: one cut
  // from the snapshot past its 256-round cap (worldSnapshot.ts MAX_SHELLS), its shooter still in sight, ends on the ground
  // (its shell_impact comes by its shooter: authoritativeMatch canObserveEvent) and burst as HE; one dropped as its
  // shooter left this viewer's sight (canObserveShell) has that end withheld with its shooter (a shell_impact names no
  // target), but its hull event on a hull the viewer sees still comes (by its target; viewerShotEvent keeps its shellId)
  // and drew a plate burst
  const busyRound = () => {
    fx.resetAll(); frames(2);
    emit('shell:fired', { shellId: id++, shooterId: 'mg', pos: [40, 2, 40], muzzlePos: [40, 2, 40], dir: [1, 0, 0],
      shellType: 'AP', caliberMm: 12.7, shellName: '12.7 mm' });
    frames(9, 0.5);
    const s = id++;
    fireAt(s, smoke);
    const round = { id: s, shooterId: 'g', pos: new THREE.Vector3(0, 12, -30), prevPos: new THREE.Vector3(0, 12.2, -31),
      vel: new THREE.Vector3(0, -4, 60), spec: { tracer: 'TANK' }, ageS: 0.5, distM: 30 };
    for (let k = 0; k < 2; k++) fx.update(0.5, [round], camera, () => null);
    frames(300); // 5 s after the last drawn frame
    return { s, held: recordCounts() };
  };
  {
    const { s, held } = busyRound();
    groundEnd(s, smoke); frames(6);
    const lateEnd = bodiesHere();
    assert.ok(near(lateEnd, quietSmoke),
      `a smoke round drawn 1 s whose ground end comes 5 s after its last drawn frame keeps its class through another record's sweep (${lateEnd} bodies at its point vs ${quietSmoke}; records before its end ${JSON.stringify(held)})`);
    assert.deepEqual(held, { inFlight: 1, hullMet: 0 },
      `the sweep at the machine gun's round's bound took its record and left the smoke round's (${JSON.stringify(held)})`);
  }
  {
    const { s, held } = busyRound();
    const before = fires();
    hullHit(s, smoke); frames(20);
    const puffs = fires() - before;
    assert.equal(puffs, 0,
      `a smoke round drawn 1 s whose hull event comes 5 s after its last drawn frame strikes as fragments through another record's sweep, no plate burst (${puffs} fire puffs; records before its end ${JSON.stringify(held)})`);
  }
  // (round 6 V1 review r1) a dead round renews no record of a round in flight: the Studio hands every round it fired each
  // frame, a dead one too, until its timeline resets (studio.ts fx.update(dt, shells, ...)), and an actor's round that flew
  // out past 4000 m (fireActorGun, the Studio's one fired record) raises no end event. Its record leaves by its firing's
  // bound, 10 s on, as any round's whose end never came; renewed while it was handed dead, it stayed till the reset, a slot
  // of the 256 each map keeps. (review r2) No Studio round holds a hull-met record (its hull events carry no shell id), so
  // the guard's hull-met half is reached by no caller and not driven here
  {
    fx.resetAll(); frames(2);
    const s = id++;
    fireAt(s, smoke);
    const spent = { id: s, shooterId: 'g', pos: new THREE.Vector3(0, 12, -30), prevPos: new THREE.Vector3(0, 12.2, -31),
      vel: new THREE.Vector3(0, -4, 60), spec: { tracer: 'TANK' }, ageS: 0.5, distM: 30, dead: true };
    for (let k = 0; k < 24; k++) fx.update(0.5, [spent], camera, () => null);
    const kept = recordCounts();
    assert.deepEqual(kept, { inFlight: 0, hullMet: 0 },
      `a dead round handed each frame for 12 s leaves the records by its firing's bound (${JSON.stringify(kept)} left)`);
  }
  // (round 4 F6 review) a sweep's least spacing holds when a record moves maps: a hull event for a record falling due
  // inside the spacing brought the next sweep forward (keepNewest lowered it for every record it stored, a moved one too)
  {
    fx.resetAll(); frames(2);
    const mg = (shellId) => emit('shell:fired', { shellId, shooterId: 'mg', pos: [40, 2, 40], muzzlePos: [40, 2, 40], dir: [1, 0, 0],
      shellType: 'AP', caliberMm: 12.7, shellName: '12.7 mm' });
    const first = id++, second = id++;
    mg(first); frames(30); mg(second);
    // one frame past the first round's bound, short of the second's: the sweep takes the first, the next waits a spacing
    frames(1, 9.75);
    const swept = recordState(), sweptAt = fxClockNow();
    assert.deepEqual([swept.inFlight, swept.hullMet], [1, 0], `the sweep took the first round's record (${JSON.stringify(swept)})`);
    emit('shell:hit', { shellId: second, attackerId: 'mg', targetId: 't2', kind: 'nonpen', damage: 0, pos: [44, 1, 40], normal: [-1, 0, 0],
      caliberMm: 12.7, shellType: 'AP', destroyed: false });
    const moved = recordState();
    assert.deepEqual([moved.inFlight, moved.hullMet], [0, 1], 'the hull event moved the second round\'s record');
    assert.ok(moved.sweepAt >= sweptAt + 1 - 1e-9,
      `a moved record keeps the sweeps a second apart (next sweep ${(moved.sweepAt - sweptAt).toFixed(3)} s after the last)`);
    frames(70);
    assert.deepEqual(recordCounts(), { inFlight: 0, hullMet: 0 }, 'and the next sweep takes the moved record');
  }
  // the bound never cuts a live flight short: a smoke round at the end of the longest flight the sim allows, and one
  // whose clock a capture pinned 500 s on mid-flight (the records' times move with the rebase), keep their class
  const lateSmoke = (pin) => {
    fx.resetAll(); frames(2);
    const s = id++;
    fireAt(s, smoke);
    frames(1);
    if (pin) fx.resetClock(fxClockNow() + 500);
    frames(59, 0.1);
    groundEnd(s, smoke); frames(6);
    return bodiesHere();
  };
  const longFlight = lateSmoke(false), pinnedFlight = lateSmoke(true);
  assert.ok(near(longFlight, quietSmoke), `a smoke round's class lasts its whole flight (${longFlight} bodies at its point vs ${quietSmoke})`);
  assert.ok(near(pinnedFlight, quietSmoke),
    `a smoke round's class lasts a forward pin of the clock mid-flight (${pinnedFlight} bodies at its point vs ${quietSmoke})`);
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
  // (round 6 V1 review r1) the drawn round's renewal keeps its record in either map: a round that met a hull and flies on
  // (a carry-through, a ricochet) reads its class from the hull-met records (round 3 B4), and its end trails a stall of
  // its events as any round's. The HEI carries through, is drawn 12 s (past its record's 10 s firing bound) and strikes the
  // ground a frame or 235 frames after its last drawn frame: its burst, as one drawn 2 s. Past the grace and a sweep's
  // spacing its record is gone and the same strike is an AP round's by its type (no fire puffs), so the burst is the
  // record's. (Renewed from the in-flight records alone, its record left at its firing's bound, mid-stall.)
  const heiDrawn = (drawnS, trailFrames) => {
    fx.resetAll(); frames(2);
    const s = id++;
    emit('shell:fired', { shellId: s, shooterId: 'ac', pos: [0, 2, -40], muzzlePos: [0, 2, -40], dir: [0, 0, 1],
      shellType: 'AP', caliberMm: 30, shellName: '30 mm HEI-T' });
    frames(1);
    emit('shell:hit', { shellId: s, attackerId: 'ac', targetId: 't3', kind: 'pen', damage: 6, pos: [0, 1, -10],
      normal: [0, 0, -1], caliberMm: 30, shellType: 'AP', destroyed: false });
    frames(1);
    const round = { id: s, shooterId: 'ac', pos: new THREE.Vector3(0, 1, -5), prevPos: new THREE.Vector3(0, 1, -6),
      vel: new THREE.Vector3(0, 0, 900), spec: { tracer: 'AP' }, ageS: 0.1, distM: 35 };
    for (let k = 0; k < drawnS * 2; k++) fx.update(0.5, [round], camera, () => null);
    frames(trailFrames);
    const held = recordCounts();
    const before = fires();
    emit('shell:expired', { shellId: s, pos: [0, 0, 0], hitTerrain: true, hitKind: 'terrain', shellType: 'AP', caliberMm: 30 });
    frames(6);
    return { held, puffs: fires() - before };
  };
  const heiShort = heiDrawn(2, 1);
  assert.deepEqual(heiShort.held, { inFlight: 0, hullMet: 1 }, `control: the HEI's record is a hull-met one (${JSON.stringify(heiShort.held)})`);
  assert.ok(heiShort.puffs > 0, `control: drawn 2 s after its carry-through, its ground strike draws its burst (${heiShort.puffs} fire puffs)`);
  for (const trailFrames of [1, 235]) {
    const stalled = heiDrawn(12, trailFrames);
    assert.equal(stalled.puffs, heiShort.puffs,
      `an HEI drawn 12 s after its carry-through, whose ground strike trails its last drawn frame by ${trailFrames} frame(s), bursts by its class (${JSON.stringify(stalled)})`);
  }
  const heiPast = heiDrawn(12, (4 + 1) * 60 + 15);
  assert.deepEqual(heiPast.held, { inFlight: 0, hullMet: 0 },
    `its hull-met record leaves by the grace and a sweep's spacing after its last drawn frame (${JSON.stringify(heiPast.held)})`);
  assert.equal(heiPast.puffs, 0, `and the strike 315 frames on is an AP round's by its type (${heiPast.puffs} fire puffs)`);
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

// ---- (round 4 F6 review) the phone tier: no volume media, so no plate burst forgets a shaped charge's record ----
{
  // a desktop runtime forgets a shaped charge's record at its plate burst (effects.ts `blast`, the media tier's), so the
  // move at a ricochet shows only where `blast` is null: the phone tier. A shaped charge the sim ends at its first
  // ricochet raises no expiry, and its record waited among the rounds in flight for drop-oldest at 256
  globalThis.window ??= {};
  globalThis.window.location = { search: '?tier=mobile' };
  const { resolveDeviceTier } = await import('../engine/quality.ts');
  assert.equal(resolveDeviceTier(), 'mobile', 'the process runs at the phone tier');
  const phone = createFx({ scene, camera, renderer: null, anisotropy: 1, setupShadowMaterial: () => {}, releaseShadowMaterial: () => {} },
    { getHeightAt: () => 0, getNormalAt: () => new THREE.Vector3(0, 1, 0), addWaterImpulse: () => {} }, { seed: 5, world: () => world });
  assert.equal(phone.group.getObjectByName('fx-volume-media') === undefined, true, 'the phone tier draws no volume media');
  const phoneHandlers = new Map();
  phone.bindBus({ on(n, f) { (phoneHandlers.get(n) ?? phoneHandlers.set(n, []).get(n)).push(f); return () => {}; } });
  const phoneEmit = (n, p) => { for (const f of phoneHandlers.get(n) ?? []) f(p); };
  phone.resetAll();
  for (let k = 0; k < 300; k++) {
    const round = 990000 + k;
    phoneEmit('shell:fired', { shellId: round, shooterId: 'ac', pos: [40, 2, 40], muzzlePos: [40, 2, 40], dir: [1, 0, 0],
      shellType: 'HEAT', caliberMm: 30, shellName: '30 mm HEAT' });
    phoneEmit('shell:hit', { shellId: round, attackerId: 'ac', targetId: 't2', kind: 'ricochet', damage: 0, pos: [44, 1, 40],
      normal: [-1, 0, 0], caliberMm: 30, shellType: 'HEAT', destroyed: false });
  }
  phone.update(1 / 60, [], camera, () => null);
  const left = recordCounts(phone);
  assert.equal(left.inFlight, 0,
    `on the phone tier, 300 shaped charges ended on a ricochet leave the records of rounds in flight (${JSON.stringify(left)})`);
  phone.resetAll();
}

console.log('heRoundRecords.selftest: an HE round keeps its records through a battle\'s other rounds, a clock rebase and a stall of its events; a late ground expiry keeps its marks; every round is recorded and an uncharged one never bursts; a round that ends unseen or on a ricochet leaves the records of rounds in flight, on either tier');
