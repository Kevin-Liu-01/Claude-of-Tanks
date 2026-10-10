// missileLooks.selftest.mjs — every guided round and rocket in the fleet takes a look of its own family; the looks differ
// in kind (fx 9a, the owner: "give different missiles different special traces"); the launch and trail recipes are seeded;
// the live FX runtime draws a missile's body, motor, wires and smoke trail.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { Vector3, PerspectiveCamera } from 'three';
import '../vehicles/tankFactory.ts';
import { TANK_SPECS } from '../vehicles/specs.ts';
import { isUnguidedRocket } from '../sim/launcherPolicy.ts';
import { MISSILE_LOOKS, missileLookFor, firedIsMissile, missileWobble, missileFlicker } from './missileLooks.ts';
import { missileLaunch, missileIgnition, missileTrailPuff } from './missileRecipes.ts';
import { puffRandom } from './atmosRecipes.ts';
import { makeVolumePuff } from './volumeMedia.ts';
import { makeChunkPiece } from './debrisChunks.ts';

// ---- 1. the fleet: every guided round resolves by its name or launch sound; every rack's rockets take the rocket look --
const rounds = [];
for (const [id, spec] of Object.entries(TANK_SPECS)) {
  for (const s of spec.gun?.shells ?? []) {
    if (!s) continue;
    const rocket = isUnguidedRocket(spec.gun, s);
    if (s.guided === true || rocket) rounds.push({ id, name: s.name, sound: s.soundProfile, rocket });
  }
}
assert.ok(rounds.length >= 30, `the fleet's guided rounds and rockets (${rounds.length})`);
for (const r of rounds) {
  assert.ok(firedIsMissile(r.sound, r.rocket), `${r.id} ${r.name}: its shot reads as a missile launch (sound ${r.sound})`);
  const l = missileLookFor(r.name, r.sound, r.rocket);
  assert.ok(l && MISSILE_LOOKS[l.id] === l, `${r.id} ${r.name}: a look`);
}
const lookOf = (name, sound, rocket = false) => missileLookFor(name, sound, rocket).id;
assert.equal(lookOf('BGM-71E TOW-2A', 'tow-launch'), 'tow');
assert.equal(lookOf('9M113M Konkurs-M', 'konkurs-launch'), 'konkurs');
assert.equal(lookOf('MILAN 2', 'milan-launch'), 'milan');
assert.equal(lookOf('Kornet guided missile', 'spike-launch'), 'kornet', 'a name beats its sound');
assert.equal(lookOf('9M117M1 Arkan', 'arkan-launch'), 'arkan');
assert.equal(lookOf('9M120-1 Ataka-T', 'ataka-launch'), 'ataka');
assert.equal(lookOf('Spike LR2 MELLS', 'spike-launch'), 'spike');
assert.equal(lookOf('Type 01 Jyu-MAT Kai', 'jyu-mat-launch'), 'spike');
assert.equal(lookOf('Type 79 Jyu-MAT', 'jyu-mat-launch'), 'jyumat');
assert.equal(lookOf('MGM-51C Shillelagh ATGM', 'shillelagh-launch'), 'shillelagh');
assert.equal(lookOf('HJ-10 guided missile', 'shillelagh-launch'), 'hellfire');
assert.equal(lookOf('FIM-92 Stinger', 'tow-launch'), 'stinger');
assert.equal(lookOf('XM1210 MRM-H Hypersonic GATGM', 'spike-launch'), 'mrm');
assert.equal(lookOf('Viper micro-missile', 'konkurs-launch'), 'viper');
assert.equal(lookOf('9M-695 Tandem', 'konkurs-launch'), 'konkurs');
assert.equal(lookOf('Guided missile', 'jyu-mat-launch'), 'spike', 'an unnamed round by its sound');
assert.equal(lookOf('', null), 'konkurs', 'a guided round that names nothing: SACLOS');
assert.equal(lookOf('9M-695 Blast', 'konkurs-launch', true), 'rocket', "a rack's rockets");
assert.equal(lookOf('Malyutka', null), 'mclos');
assert.ok(!firedIsMissile('2a42', false) && !firedIsMissile(null, undefined) && firedIsMissile(null, true), 'guns are not missiles');
const familiesInFleet = new Set(rounds.map((r) => missileLookFor(r.name, r.sound, r.rocket).family));
assert.ok(familiesInFleet.size >= 9, `the fleet's missiles span ${familiesInFleet.size} families`);

// ---- 2. the families differ in kind --------------------------------------------------------------------------------
const L = MISSILE_LOOKS;
assert.ok(L.tow.wires === 2 && L.konkurs.wires === 1 && L.milan.wires === 1 && L.kornet.wires === 0 && L.spike.wires === 0,
  'wire-guided rounds trail their wires (TOW two); beam-riders and fire-and-forget none');
assert.ok(L.tow.flicker >= 0.3 && L.shillelagh.flicker >= 0.5 && L.hellfire.flicker <= 0.1 && L.rocket.flicker <= 0.2,
  'a tracking beacon pulses; a motor burns steadily');
assert.ok(L.kornet.smoke.density <= 0.15 && L.arkan.smoke.density <= 0.15 && L.mrm.smoke === null,
  'beam-riders are near smokeless; the hypersonic dart smokeless');
assert.ok(L.hellfire.smoke.density >= 0.7 && L.rocket.smoke.density >= 0.75 && L.stinger.smoke.density >= 0.55,
  'rail missiles, rockets and MANPADS leave a dense white trail');
assert.ok(L.hellfire.smoke.life >= 6 && L.kornet.smoke.life <= 2, 'a dense trail persists, a near-smokeless one is gone at once');
assert.ok(L.mclos.wobbleM >= 0.5 && L.mclos.smoke.density >= 0.55 && L.mclos.smoke.c0[0] < L.hellfire.smoke.c0[0],
  'an old MCLOS round is smoky, darker and wobbles');
assert.ok(L.spike.igniteM > 4 && L.stinger.igniteM > 4 && L.spike.launch === 'soft_eject' && L.stinger.launch === 'soft_eject',
  'a soft launch coasts before its motor lights');
assert.ok(L.arkan.launch === 'gun' && L.shillelagh.launch === 'gun' && L.mrm.launch === 'gun' && L.arkan.igniteM >= 10,
  'a gun-launched round leaves the gun and lights clear of the muzzle');
assert.ok(L.tow.launch === 'tube' && L.hellfire.launch === 'rail' && L.rocket.launch === 'canister');
const ids = Object.keys(L);
const sig = (l) => [l.family, l.launch, l.wires, l.smoke ? Math.round(l.smoke.density * 10) : -1, Math.round(l.flicker * 10)].join();
assert.ok(new Set(ids.map((k) => sig(L[k]))).size >= ids.length - 2, 'the looks are distinct signatures, not one trail recoloured');

// ---- 3. steering, flicker: bounded, frame-rate independent, ramping in from the launcher ---------------------------
const w = [0, 0];
missileWobble(L.mclos, 0, 0.3, w);
assert.deepEqual(w, [0, 0], 'no offset at launch');
let maxW = 0;
for (let t = 0; t < 8; t += 0.01) { missileWobble(L.mclos, t, 0.3, w); maxW = Math.max(maxW, Math.hypot(w[0], w[1])); }
assert.ok(maxW > 0.25 && maxW <= L.mclos.wobbleM * 1.2, `MCLOS wobbles within its amplitude (${maxW.toFixed(2)} m)`);
missileWobble(L.tow, 1.234, 0.7, w); const a = [...w]; missileWobble(L.tow, 1.234, 0.7, w);
assert.deepEqual(w, a, 'the same time, the same offset');
for (let t = 0; t < 3; t += 0.013) {
  const f = missileFlicker(L.tow, t, 0.2);
  assert.ok(f >= 1 - L.tow.flicker - 1e-9 && f <= 1 + 1e-9, 'the flicker stays in its band');
}
assert.equal(missileFlicker(L.mrm, 1, 0.5), 1, 'a steady motor');

// ---- 4. recipes: seeded, the launch kind visible in what they emit ----------------------------------------------------
function ctx() {
  const log = { media: [], flash: 0, fire: 0 };
  return { log, C: {
    rand: () => { throw new Error('missile recipes take their own stream'); }, groundY: () => 0,
    media: (p) => log.media.push({ ...p }), chunk: () => {}, flash: () => { log.flash++; }, fire: () => { log.fire++; },
    sparks: () => {}, jet: () => {}, shockRing: () => {}, lightPulse: () => {}, glow: () => {}, distBoost: () => 1, tier: 1,
    m: makeVolumePuff(), k: makeChunkPiece(),
    lp: { pos: [0, 0, 0], vel: [0, 0, 0], life: 1, size0: 1, size1: 1, rot: 0, rotVel: 0, col0: [1, 1, 1], col1: [1, 1, 1], alpha: 1, grav: 0, birthOffset: 0 },
    ls: { pos: [0, 0, 0], vel: [0, 0, 0], life: 1, width: 0.03, stretch: 0.03, grav: -18, col: [1, 1, 1], alpha: 1, seed: 0, birthOffset: 0 },
    lj: { pos: [0, 0, 0], axis: [0, 1, 0], life: 0.1, width: 0.5, len0: 0.5, len1: 3, seed: 0, col: [1, 1, 1], alpha: 1, birthOffset: 0 },
  } };
}
const launch = (look) => { const c = ctx(); missileLaunch(c.C, puffRandom(99), look, 0, 2.2, 0, 1, 0, 0, 0, 0); return c.log; };
const tube = launch(L.tow), gun = launch(L.arkan), soft = launch(L.spike), rail = launch(L.hellfire), can = launch(L.rocket);
assert.deepEqual(launch(L.tow), tube, 'the same launch twice');
assert.ok(tube.media.some((m) => m.vx < -4) && tube.media.some((m) => m.vx > 4) && tube.flash === 1,
  'a tube launch: gas out of the mouth, a backblast out of the rear, a short flash');
assert.ok(tube.media.some((m) => m.aspect > 2 && m.y < 1), 'the backblast kicks the ground dust up');
assert.ok(gun.media.length === 1 && gun.flash === 0, "a gun launch is the gun's own blast and a wisp");
assert.ok(soft.flash === 0 && soft.media.length === 3 && soft.media.every((m) => m.size1 < 2), 'a soft launch: a small eject puff, no flash');
assert.ok(rail.flash === 1 && rail.media.length >= 5 && rail.media.every((m) => m.density >= 0.7), 'a rail launch: a flash in a dense cloud');
assert.ok(can.fire >= 2 && can.media.length >= can.media.filter((m) => m.aspect > 2).length + 6, 'a canister: flame and a dense cloud');
{
  const c = ctx();
  missileIgnition(c.C, puffRandom(7), L.spike, 8, 2.2, 0, 1, 0, 0, -0.02);
  assert.ok(c.log.flash === 1 && c.log.media.length === 3, 'a coasting motor lights with a pop and a burst of smoke');
  const t1 = ctx(), t2 = ctx();
  missileTrailPuff(t1.C, puffRandom(5), L.tow, 10, 2, 0, 1, 0, 0, 0.5, -0.1);
  missileTrailPuff(t2.C, puffRandom(5), L.tow, 10, 2, 0, 1, 0, 0, 0.5, -0.1);
  assert.deepEqual(t1.log.media, t2.log.media, 'a trail puff is a function of its seed');
  assert.ok(t1.log.media[0].vx < 0 && t1.log.media[0].birthOffset === -0.1, 'it leaves backward, born when the motor passed');
  const none = ctx();
  missileTrailPuff(none.C, puffRandom(5), L.mrm, 10, 2, 0, 1, 0, 0, 0, 0);
  assert.equal(none.log.media.length, 0, 'no smoke, no puff');
}

// ---- 5. the live runtime: body, motor, wires and a trail born along the flight -----------------------------------------
const { createCanvas } = createRequire(import.meta.url)('@napi-rs/canvas');
const priorDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
globalThis.document = { createElement: (tag) => { assert.equal(tag, 'canvas'); return createCanvas(1, 1); } };
const { createFx } = await import('./effects.ts');
const { createBus } = await import('../game/state.ts');
const { disposeObject3DResources } = await import('../engine/resourceLifetime.ts');
const flat = { getHeightAt: () => 0, getGroundType: () => 'medium', getNormalAt: () => new Vector3(0, 1, 0) };
let fx;
try {
  fx = createFx({ anisotropy: 1 }, flat, { seed: 77 });
  const bus = createBus(); fx.bindBus(bus);
  const camera = new PerspectiveCamera(50, 16 / 9, 0.5, 3000); camera.position.set(-30, 6, 40); camera.lookAt(80, 2, 0);
  camera.updateMatrixWorld();
  const named = (n) => { let o = null; fx.group.traverse((c) => { if (!o && c.name === n && c.geometry) o = c; }); return o; };
  const fly = (name, sound, speed, frames) => {
    fx.resetAll();
    bus.emit('shell:fired', { shellId: 9001, shooterId: 'x', muzzlePos: [0, 2.2, 0], dir: [1, 0, 0], caliberMm: 152,
      shellType: 'HEAT', shellName: name, weaponSound: sound });
    const shell = { id: 9001, pos: new Vector3(0, 2.2, 0), prevPos: new Vector3(0, 2.2, 0), vel: new Vector3(speed, 0, 0),
      distM: 0, ageS: 0, spec: { guided: true, tracer: 'ATGM', name, soundProfile: sound, type: 'HEAT' } };
    const out = [];
    for (let f = 0; f < frames; f++) {
      const dt = 1 / 30;
      shell.prevPos.copy(shell.pos); shell.pos.x += speed * dt; shell.distM += speed * dt; shell.ageS += dt;
      fx.update(dt, [shell], camera);
      out.push({ dbg: fx.getGuidedMissileDebug(), tracers: named('Projectile tracers')?.geometry.instanceCount ?? 0,
        media: named('fx-volume-media')?.geometry.instanceCount ?? 0 });
    }
    return out;
  };
  const tow = fly('BGM-71E TOW-2A', 'tow-launch', 195, 12);
  assert.ok(tow.every((f) => f.dbg.bodies === 1), 'a TOW in flight draws its body');
  assert.ok(tow.at(-1).dbg.trailSegments > 0, 'its motor and plume once lit');
  assert.ok(tow.at(-1).tracers >= 1 + 2 * 6, `its motor and two wires of six stretches (${tow.at(-1).tracers} capsules)`);
  const kornet = fly('Kornet guided missile', 'spike-launch', 240, 12);
  assert.ok(kornet.at(-1).tracers >= 1 && kornet.at(-1).tracers < 6, 'a beam-rider trails no wires');
  if (named('fx-volume-media')) {
    assert.ok(tow.at(-1).media > kornet.at(-1).media, `a TOW's trail outweighs a Kornet's (${tow.at(-1).media} vs ${kornet.at(-1).media})`);
  }
  const spike = fly('Spike LR', 'spike-launch', 117, 2);
  assert.equal(spike[0].dbg.trailSegments, 0, 'a soft-launched Spike coasts unlit for its first metres');
} finally {
  if (fx) { fx.resetAll(); disposeObject3DResources(fx.group); }
  if (priorDocument) Object.defineProperty(globalThis, 'document', priorDocument); else delete globalThis.document;
}
console.log(`missileLooks: ${rounds.length} fleet rounds over ${familiesInFleet.size} families; distinct looks, seeded launches and trails; live body, motor, wires and trail passed`);
