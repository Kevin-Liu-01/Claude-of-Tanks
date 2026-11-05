// Release 269: the rotary cannon's spin (gunRotorSpin.ts; the M163 VADS's Vulcan, the owner 2026-11-04: "that m163
// literally has a gatling gun/minigun on its turret"). Presentation only, on a bare THREE group:
//  - a rotor needs whole barrels (two or more) and a positive cycle; findGunRotor finds the tagged group under a rig and
//    nothing on an untagged one;
//  - at rest it never turns; a shot spins it up over spinUpS (about half speed half way), firing holds it at one barrel
//    position per cycle (capped at maxStepRad a step), and holdS after the last shot it coasts down and stops;
//  - a zero step (a pinned fx clock) holds it exactly; stop() halts it dead at its angle;
//  - advance() allocates nothing (its source carries no `new`, no literal and no closure) and reads no clock.
// First-party tooling: Kevin B. Liu (NOTICE.md).
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createGunRotorSpin, findGunRotor, GUN_ROTOR_DEFAULTS, GUN_ROTOR_KEY } from './gunRotorSpin.ts';

const near = (a, b, tol, message) => assert.ok(Math.abs(a - b) <= tol, `${message}: ${a} vs ${b}`);
const DT = 1 / 120;
const step = (spin, seconds, dt = DT, onStep = null) => {
  for (let k = Math.round(seconds / dt); k > 0; k--) { spin.advance(dt); onStep?.(); }
};

// the tag and the finder
{
  const recoil = new THREE.Group(), other = new THREE.Group(), rotor = new THREE.Group();
  recoil.add(other);
  assert.equal(findGunRotor(recoil), null, 'an untagged rig has no rotor');
  rotor.userData[GUN_ROTOR_KEY] = { barrels: 6, cycleS: 0.06 };
  other.add(rotor);
  assert.equal(findGunRotor(recoil), rotor, 'the tagged group is found under the rig');
  for (const bad of [{ barrels: 1, cycleS: 0.06 }, { barrels: 6.5, cycleS: 0.06 }, { barrels: 6, cycleS: 0 }, null]) {
    const g = new THREE.Group();
    g.userData[GUN_ROTOR_KEY] = bad;
    assert.equal(findGunRotor(g), null, `a bad tag is no rotor (${JSON.stringify(bad)})`);
    assert.throws(() => createGunRotorSpin(g), TypeError, 'a spin needs a good tag');
  }
}

// the timeline
{
  const rotor = new THREE.Group();
  const cycleS = 0.06, barrels = 6;
  rotor.userData[GUN_ROTOR_KEY] = { barrels, cycleS };
  const spin = createGunRotorSpin(rotor);
  const firing = (2 * Math.PI / barrels) / cycleS;
  step(spin, 1);
  assert.equal(spin.speed, 0, 'at rest it never turns');
  assert.equal(rotor.rotation.z, 0, 'at rest the rotor holds its angle');
  // a burst: one kick per cycle
  let sinceShot = 0;
  const burst = () => { sinceShot += DT; if (sinceShot >= cycleS - 1e-9) { sinceShot = 0; spin.kick(); } };
  spin.kick();
  step(spin, GUN_ROTOR_DEFAULTS.spinUpS / 2, DT, burst);
  near(spin.speed, 0.5, 0.05, 'half way up after half the spin-up');
  assert.ok(rotor.rotation.z > 0, 'it turns as it spins up');
  step(spin, GUN_ROTOR_DEFAULTS.spinUpS, DT, burst);
  assert.equal(spin.speed, 1, 'at firing speed once spun up');
  const before = spin.angle;
  step(spin, 0.6, DT, burst);
  const turned = ((spin.angle - before) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  near(turned, (firing * 0.6) % (2 * Math.PI), 1e-6, 'one barrel position per shot while firing');
  near(rotor.rotation.z, spin.angle, 1e-12, 'the rotor carries the angle');
  // a pinned clock holds it
  const pinned = spin.angle;
  spin.advance(0);
  assert.equal(spin.angle, pinned, 'a zero step holds the rotor');
  // the burst ends (its last shot now): it keeps turning through the hold, then coasts down and stops
  spin.kick();
  step(spin, GUN_ROTOR_DEFAULTS.holdS * 0.9);
  assert.equal(spin.speed, 1, 'a gap shorter than the hold keeps it at speed');
  step(spin, GUN_ROTOR_DEFAULTS.holdS * 0.1 + GUN_ROTOR_DEFAULTS.coastS);
  assert.ok(spin.speed < 0.45 && spin.speed > 0.25, `it coasts down after the hold (speed ${spin.speed.toFixed(3)})`);
  step(spin, 4);
  assert.equal(spin.speed, 0, 'it comes to rest');
  const rested = rotor.rotation.z;
  step(spin, 1);
  assert.equal(rotor.rotation.z, rested, 'at rest again it holds its angle');
  // a long frame never turns it more than the cap (it reads as turning forward, never strobing backwards)
  spin.kick();
  step(spin, 0.5, 1 / 60, () => spin.kick());
  const a0 = spin.angle;
  spin.kick();
  spin.advance(0.1);
  const turnedLong = ((spin.angle - a0) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  near(turnedLong, GUN_ROTOR_DEFAULTS.maxStepRad, 1e-9, 'a long frame turns it by the cap');
  assert.ok(GUN_ROTOR_DEFAULTS.maxStepRad < Math.PI / barrels, 'the cap is under half a barrel position');
  // stop halts it dead where it is
  const halted = spin.angle;
  spin.stop();
  step(spin, 0.5);
  assert.equal(spin.speed, 0, 'stopped');
  assert.equal(spin.angle, halted, 'stopped at its angle');
}

// allocation-free and clock-free
{
  const source = (await import('node:fs')).readFileSync(new URL('./gunRotorSpin.ts', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('advance(dt) {'), source.indexOf('stop() {'));
  assert.ok(body.length > 50, 'advance() found');
  for (const banned of ['new ', '[', '{ ', '=>', 'Date', 'performance']) {
    assert.ok(!body.slice('advance(dt) {'.length).includes(banned), `advance() carries no ${JSON.stringify(banned)}`);
  }
  assert.ok(!/Date\.now|performance\.now|Math\.random/.test(source), 'no clock and no randomness');
}
console.log('gunRotorSpin.selftest: OK');
