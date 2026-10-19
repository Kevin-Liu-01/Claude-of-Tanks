// gunshipRounds.selftest.mjs — the AC-130's three guns map onto the October effects (lane ac130-fx-228, 2026-10-19).
// One resolver names the gun of a round or a shot; the tracers give the 30 mm and the 152 mm their own classes (NATO
// ammunition whatever tank the pilot chose), the missile is the hellfire look, and the composer's frozen round is a
// pooled static entry of the same tracer draw, aged on the effects clock.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GUNSHIP_WEAPONS } from '../sim/matchRuleset.ts';
import { gunshipCaliberMm, gunshipRoundOf, gunshipShotOf } from './gunshipRounds.ts';
import { createProjectileTracers, tracerClassFor, tracerRoundClass } from './projectileTracers.ts';
import { firedIsMissile, missileLookFor, missileTrailOf, MISSILE_LOOKS } from './missileLooks.ts';
import { MISSILE_AIRFRAMES } from './missileBodies.ts';

// ---- the resolver: a local round by its reload group or sound, a networked one by its aircraft ----
const [cannon, howitzer, missile] = GUNSHIP_WEAPONS;
assert.equal(gunshipRoundOf(cannon, false), 'cannon');
assert.equal(gunshipRoundOf(howitzer, false), 'howitzer');
assert.equal(gunshipRoundOf(missile, false), 'missile');
assert.equal(gunshipRoundOf({ soundProfile: 'gunship-howitzer', type: 'HE' }, false), 'howitzer', 'the sound names the gun');
assert.equal(gunshipRoundOf({ type: 'AP' }, true), 'cannon', 'a snapshot round of a gunship: AP is the autocannon');
assert.equal(gunshipRoundOf({ type: 'HE' }, true), 'howitzer', 'a snapshot round of a gunship: HE is the howitzer');
assert.equal(gunshipRoundOf({ type: 'HE', guided: true }, true), 'missile', 'a snapshot round of a gunship: guided is the missile');
assert.equal(gunshipRoundOf({ type: 'APFSDS', caliberMm: 120 }, false), null, "a tank's round is not the gunship's");
assert.equal(gunshipRoundOf(null, false), null);
assert.equal(gunshipShotOf('gunship-autocannon', false), 'cannon');
assert.equal(gunshipShotOf('gunship-missile', false), 'missile');
assert.equal(gunshipShotOf('m256', false, 'APFSDS'), null);
assert.equal(gunshipShotOf(null, true, 'HE', false), 'howitzer', 'a shot of a gunship with no sound: its round decides');
assert.equal(gunshipCaliberMm('cannon'), cannon.caliberMm);
assert.equal(gunshipCaliberMm('howitzer'), howitzer.caliberMm, 'calibres come from the ruleset (matchRuleset.ts)');
assert.equal(gunshipCaliberMm('missile'), missile.caliberMm);

// ---- the tracer classes: the 30 mm and the 152 mm differ, both NATO, both unlike a ground gun's ----
const t90Pilot = { id: 't90am', nation: 'Russia', gun: { caliberMm: 125, shells: [{ type: 'APFSDS' }] } };
const c30 = tracerRoundClass(cannon, t90Pilot, true), c152 = tracerRoundClass(howitzer, t90Pilot, true);
assert.equal(c30.lineage, 'nato', "a T-90 pilot's AC-130 still fires NATO (red) tracers");
assert.equal(c152.lineage, 'nato');
assert.equal(c30.caliberMm, 30);
assert.equal(c152.caliberMm, 152);
assert.ok(c152.cls.halfWidthPx > c30.cls.halfWidthPx * 1.4, 'the howitzer core is far wider than the autocannon');
assert.ok(c152.cls.haloPx > c30.cls.haloPx, 'and its halo larger');
assert.ok(c152.cls.halfWidthPx >= 1.5 * tracerClassFor(120, 'nato').halfWidthPx, 'about 1.5-2x a tank round');
assert.equal(c152.cls.beltEvery, 1, 'every howitzer round is traced');
assert.ok(c30.cls.beltEvery >= 2 && c30.cls.beltEvery <= 3, 'the autocannon belt: every 2nd-3rd round');
assert.ok(c30.cls.beltEvery < tracerClassFor(30, 'nato').beltEvery, "denser than a ground autocannon's belt");
assert.ok(c152.cls.streakMaxM >= 22, 'the howitzer streak reaches the dark exposure (~22 m at 800 m/s)');
assert.ok(c152.cls.burnS > 1, 'its burn outlasts the slant flight');
const snapshot = tracerRoundClass({ type: 'HE', tracer: 'HE', guided: false }, t90Pilot, true);
assert.equal(snapshot.cls, c152.cls, 'a networked howitzer round (no reload group) resolves through its aircraft');
assert.equal(tracerRoundClass({ type: 'HE', tracer: 'HE' }, t90Pilot, false).cls, tracerClassFor(125, 'east'),
  "the same snapshot from a tank is the tank's");

// ---- the runtime: gunship rounds draw in the one tracer program; the composer's static ages and shifts ----
let now = 5;
const shooters = { pilot: { id: 't90am', nation: 'Russia', gun: { caliberMm: 125, shells: [] } } };
const tr = createProjectileTracers({ shooter: (id) => shooters[id] ?? null, scene: new THREE.Scene(), now: () => now,
  gunship: (id) => id === 'pilot', capacity: 64 });
const geo = tr.mesh.geometry, head = geo.getAttribute('aHead'), core = geo.getAttribute('aCore');
const round = (id, spec, distM) => ({ id, shooterId: 'pilot', pos: new THREE.Vector3(0, 100, distM), vel: new THREE.Vector3(0, -400, 700),
  ageS: distM / 800, distM, spec });
tr.begin(); tr.write(round(1, { type: 'HE', guided: false }, 120)); tr.end();
assert.equal(geo.instanceCount, 1, 'the snapshot howitzer round draws');
assert.ok(head.getW(0) >= 2.2, 'in the heavy gunship class');
assert.ok(core.getX(0) > core.getZ(0), 'a warm orange compound');
tr.reset();
tr.begin(); for (let i = 0; i < 6; i++) tr.write(round(10 + i, { type: 'AP', reloadGroup: 'gunship-cannon', caliberMm: 30 }, 100)); tr.end();
assert.equal(geo.instanceCount, 3, 'the 30 mm belt: every second round lit');
assert.ok(core.getX(0) > 2 * core.getY(0) && core.getY(0) > 3 * core.getZ(0), 'NATO red-orange, not the pilot tank lineage green');
tr.reset();
// the composer: a pooled static round, full for 0.3 s, gone by 0.9 s, shifted with the clock
tr.begin(); tr.compose(0, 2, 3.4, 0, 2, 1.2, 120, now); tr.end();
assert.equal(geo.instanceCount, 1, 'the composed round draws');
assert.ok(tr.active() && tr.stats().statics === 1);
now += 0.5; tr.begin(); tr.end();
const fading = core.getX(0);
assert.ok(geo.instanceCount === 1 && fading > 0, 'fading at 0.5 s');
tr.shiftTime(-100); now -= 100; tr.begin(); tr.end();
assert.ok(Math.abs(core.getX(0) - fading) < 1e-6, 'a clock rebase keeps its age');
now += 0.6; tr.begin(); tr.end();
assert.equal(geo.instanceCount, 0, 'gone by 0.9 s');
tr.begin(); tr.compose(0, 2, 3.4, 0, 2, 1.2, 120, now); tr.end(); tr.reset();
assert.equal(geo.instanceCount, 0, 'reset clears the composed round');
assert.equal(tr.stats().statics, 0);

// ---- the missile: the hellfire look, its launch counted as a missile's, its airframe warmed ----
assert.equal(missileLookFor('Guided Missile', 'gunship-missile').id, 'hellfire', "the gunship's missile is the hellfire");
assert.equal(missileLookFor(null, 'gunship-missile').id, 'hellfire', 'by its sound alone (a networked shot)');
assert.equal(MISSILE_LOOKS.hellfire.launch, 'rail');
assert.ok(missileTrailOf(MISSILE_LOOKS.hellfire), 'with its dense persistent trail');
assert.equal(firedIsMissile('gunship-missile', false), true, 'its shot is a missile launch, not a cannon flash');
// (r2) a heat-imaging lens sees the burning compound at its night radiance in daylight: hot core, wide halo
{
  let heat = false;
  const lens = createProjectileTracers({ shooter: (id) => shooters[id] ?? null, scene: new THREE.Scene(), now: () => now,
    gunship: (id) => id === 'pilot', thermal: () => heat, capacity: 16 });
  const g = lens.mesh.geometry, tail = g.getAttribute('aTail'), haloA = g.getAttribute('aHalo');
  const draw = () => { lens.begin(); for (let i = 0; i < 2; i++) lens.write(round(40 + i, { type: 'AP', reloadGroup: 'gunship-cannon', caliberMm: 30 }, 100)); lens.end(); };
  draw();
  const dayHalo = tail.getW(0), dayDark = haloA.getW(0);
  lens.reset(); heat = true; draw();
  assert.equal(lens.darkLevel(), 1, 'the infrared lens reads the rounds as the night does');
  assert.ok(haloA.getW(0) === 1 && dayDark === 0 && tail.getW(0) > dayHalo, 'their night halo, in daylight');
  lens.reset(); heat = false; draw();
  assert.equal(lens.darkLevel(), 0, 'and the daylight lens as the day does');
  lens.reset();
}
assert.equal(firedIsMissile('gunship-howitzer', false), false);
assert.equal(firedIsMissile('tow-launch', false), true);
assert.ok(Object.hasOwn(MISSILE_AIRFRAMES, 'hellfire'), 'the covered warm writes the hellfire airframe (warmProjectilePresentation)');

console.log('gunshipRounds: the resolver, the 30 mm and 152 mm tracer classes (NATO), snapshots, the composer static and the hellfire passed');
