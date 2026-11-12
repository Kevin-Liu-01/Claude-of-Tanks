// strikeRuns.selftest.mjs — one run per strike (air-support-runs-272; owner 2026-11-11: "planes need to follow proper
// actual flight paths, be aligned with the explosion highlight areas, and the bomb dropping should be from a jet").
// The aircraft's path, its release points and its footprint come from one description (sim/strikeRuns.ts); this pins
// that they agree, with the tolerances stated in metres and degrees:
//   - the flight is a real path: no jump in place (each 1/60 s step within the speed it flies, 1 %), no instant turn (the
//     yaw rate within the turn's own), never sideways (the velocity's heading on the nose's within 0.5 deg), its pitch its
//     climb angle (within 0.5 deg; the strafing jet's nose within 8 deg of it while it walks the gun), its bank the
//     turn's own (tan bank = v * rate / g within 1 deg); it comes in from about 600 m out or more and leaves to at least 1 km;
//   - strafe: while the gun fires the jet flies the lane's axis (0.01 m off it), its rounds leave the GAU-8 under the
//     nose (0.01 m) and land in the lane (the lane's footprint widened by the burst's own along-spread, 2.5 m);
//   - bomb: dropped by the jet (the bomber is the strike jet, never the AC-130), an unpowered store (no tracer, no
//     motor's flame: fx/freeFallStores.ts, named to a client by its announcement): the bomb leaves the port pylon at the
//     run's release (0.01 m), with the jet's velocity (within 5 m/s: the solve onto a miss of at most 8 m from a pylon 3.9 m
//     off the axis over a 2.7 s fall), arrives at
//     least 40 deg steep, and lands inside the ellipse footprint, which is long along the heading;
//   - gunship: a left-hand pylon turn centred on the mark at the footprint's radius (0.01 m) and altitude, its bank the
//     pivotal altitude's, so the line from its guns to the mark lies along its left wing (within 3 deg), and its rounds
//     leave its left side;
//   - artillery: no aircraft; its rounds land in its circle;
//   - the authored round counts (improve-271 plan 007): strafe 28, bomb 1, artillery 10, the AC-130's 30 mm 60 and 152 mm 7.
import assert from 'node:assert/strict';
import { AIR_STRIKE_KINDS, AIR_SUPPORT_RULES as R, AIR_STRIKE_WEAPONS, airStrikeFlies } from './matchRuleset.ts';
import { createAirSupport, STRIKE_TICK_HZ, strikeDueTick, strikeTick } from './airSupport.ts';
import { SIM_DT } from './movement.ts';
import { stepAirSupportFire, strikeRoundPayload } from './airSupportFire.ts';
import { isFreeFallStore, markFreeFallStore } from '../fx/freeFallStores.ts';
import { shellGravityMps2 } from './ballistics.ts';
import {
  BOMB_GRAVITY_MPS2, bombFall, bombReleaseOffsetS, footprintCovers, runExitS, runFootprint, runMuzzle, runPose, runVelocity,
} from './strikeRuns.ts';

const DEG = 180 / Math.PI;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const pose = () => ({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0, bank: 0 });
const lines = [];

assert.equal(1 / STRIKE_TICK_HZ, SIM_DT, 'the strike clock\'s ticks are the sim\'s steps');
// the strike clock on the step grid: a resumed clock a fraction of a tick off its grid names the same step
assert.equal(strikeTick(14.033), strikeDueTick(842 / 60), 'a resume on battleTimeMs (14.033) is the step a landing at 842/60 falls due in');
assert.equal(strikeTick(14.0335), 842);
assert.equal(strikeDueTick(842 / 60 + 1e-9), 842, 'a moment a hair past a step falls due in that step');
assert.equal(strikeDueTick(842.5 / 60), 843, 'a moment between steps falls due in the next');
assert.equal(BOMB_GRAVITY_MPS2, shellGravityMps2(AIR_STRIKE_WEAPONS.bomb), 'the run falls the bomb under its own shell\'s gravity');

// ---- the flight: continuous, lined up, banked as it turns
const marks = [
  { x: 0, y: 0, z: 0, heading: 0 }, { x: 310, y: 42, z: -120, heading: 2.2 }, { x: -80, y: 7, z: 455, heading: -1.1 },
];
const stats = {};
for (const kind of ['recon', 'strafe', 'bomb', 'gunship']) {
  for (const [m, mark] of marks.entries()) {
    for (const id of [4, 7]) {
      const strike = { id: id + m * 10, kind, ...mark, calledS: 50, landsS: 50 + R[kind].warningS };
      const exitS = runExitS(R, strike);
      const dt = 1 / 60;
      const a = pose(), b = pose();
      let worst = { step: 0, side: 0, pitch: 0, bank: 0, yawRate: 0, banked: 0 };
      runPose(R, strike, strike.calledS, a);
      const enterM = Math.hypot(a.x - mark.x, a.z - mark.z);
      for (let t = strike.calledS; t < exitS - dt; t += dt) {
        runPose(R, strike, t, a); runPose(R, strike, t + dt, b);
        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, step = Math.hypot(dx, dy, dz);
        const v = runVelocity(R, strike, t + dt * 0.5, { x: 0, y: 0, z: 0 }), speed = Math.hypot(v.x, v.y, v.z);
        // no jump: the step is the speed it flies
        worst.step = Math.max(worst.step, Math.abs(step / dt - speed) / speed);
        // never sideways: the ground track's heading is the nose's
        const track = Math.atan2(dx, dz), mid = a.yaw + wrap(b.yaw - a.yaw) * 0.5;
        worst.side = Math.max(worst.side, Math.abs(wrap(track - mid)) * DEG);
        // the nose on the climb angle (the strafing jet's nose walks its gun while it fires)
        const climb = Math.atan2(dy, Math.hypot(dx, dz));
        const firing = kind === 'strafe' && t >= strike.landsS && t <= strike.landsS + R.strafe.fireS;
        const pitchErr = Math.abs((a.pitch + b.pitch) * 0.5 - climb) * DEG;
        if (firing) assert.ok(pitchErr <= 8, `${kind} the nose walks the gun within 8 deg of its flight path (${pitchErr.toFixed(2)})`);
        else worst.pitch = Math.max(worst.pitch, pitchErr);
        // the bank a turn of this rate at this speed needs (a settled turn: past the roll-in and before the roll-out)
        const yawRate = wrap(b.yaw - a.yaw) / dt, vh = Math.hypot(dx, dz) / dt;
        worst.yawRate = Math.max(worst.yawRate, Math.abs(yawRate));
        if (Math.abs(yawRate) > 1e-4 && Math.abs(a.bank - b.bank) < 1e-9) {
          worst.bank = Math.max(worst.bank, Math.abs(Math.atan(vh * yawRate / 9.81) + a.bank) * DEG);
          if (Math.abs(a.bank) > 0.3) worst.banked++;
        }
      }
      runPose(R, strike, exitS, a);
      const leaveM = Math.hypot(a.x - mark.x, a.z - mark.z);
      assert.ok(worst.step < 0.01, `${kind} no jump: each step within 1 % of its speed (${(worst.step * 100).toFixed(3)} %)`);
      assert.ok(worst.side < 0.5, `${kind} never flies sideways (${worst.side.toFixed(3)} deg)`);
      assert.ok(worst.pitch < 0.5, `${kind} the nose holds the climb angle (${worst.pitch.toFixed(3)} deg)`);
      assert.ok(worst.bank < 1, `${kind} banks as its turn demands (${worst.bank.toFixed(3)} deg off)`);
      assert.ok(worst.banked > 60 * 5, `${kind} flies a banked turn (${worst.banked} settled steps)`);
      assert.ok(worst.yawRate < 0.45, `${kind} no instant turn (${worst.yawRate.toFixed(3)} rad/s)`);
      assert.ok(enterM >= 595, `${kind} comes in from afar (${enterM.toFixed(0)} m at the call)`);
      assert.ok(leaveM >= 1000, `${kind} flies out of the battle (${leaveM.toFixed(0)} m at its exit)`);
      const s = stats[kind] ??= { step: 0, side: 0, pitch: 0, bank: 0, enter: Infinity, leave: Infinity };
      s.step = Math.max(s.step, worst.step); s.side = Math.max(s.side, worst.side); s.pitch = Math.max(s.pitch, worst.pitch);
      s.bank = Math.max(s.bank, worst.bank); s.enter = Math.min(s.enter, enterM); s.leave = Math.min(s.leave, leaveM);
    }
  }
}
for (const [kind, s] of Object.entries(stats)) {
  lines.push(`${kind.padEnd(8)} flight: step ${(s.step * 100).toFixed(3)} % of speed, sideways ${s.side.toFixed(3)} deg, pitch ${s.pitch.toFixed(3)} deg, bank ${s.bank.toFixed(3)} deg; in from ${s.enter.toFixed(0)} m, out to ${s.leave.toFixed(0)} m`);
}

// ---- the rounds and the footprints: the real fire step, on sloped ground, per kind
const ground = (x, z) => 30 + 0.04 * x - 0.03 * z;
function fireRun(kind, heading) {
  const caller = { id: 'c', team: 'alpha', state: { pos: { x: -300 * Math.sin(heading), y: 0, z: -300 * Math.cos(heading) } }, combat: { destroyed: false } };
  const enemy = { id: 'e', team: 'bravo', state: { pos: { x: 6, y: ground(6, 4), z: 4 } }, combat: { destroyed: false } };
  const entities = [caller, enemy];
  const support = createAirSupport({ rules: R, entities, teamOf: (e) => e.team, terrainHeight: ground, emit() {}, seed: 1234 });
  const saved = support.capture(); saved.points = [['c', R.points.cap], ['e', 0]]; support.restore(saved);
  assert.ok(support.requestStrike('c', kind, 0, 0, 10), `${kind} called`);
  const strike = support.strikes[0];
  const shells = [];
  let nextId = 1;
  const ctx = { entities, isSpotted: () => true, teamOf: (e) => e.team, terrainHeight: ground, nextId: () => nextId++,
    launch: (shell) => shells.push({ shell, t: now, pos: shell.pos.clone(), vel: shell.vel.clone(), name: shell.spec.name }) };
  let now = 10;
  for (let n = 1; n <= 60 * 60; n++) { const prev = now; now = 10 + n / 60; stepAirSupportFire(support, prev, now, ctx); }
  return { strike, shells };
}
const landing = (pos, vel, g) => {
  // the free fall onto the sloped ground (stepped finely: the receipt's own integration, not the run's)
  let x = pos.x, y = pos.y, z = pos.z, vy = vel.y, t = 0;
  const h = 1 / 2000;
  while (y > ground(x, z) && t < 30) { x += vel.x * h; z += vel.z * h; y += vy * h - 0.5 * g * h * h; vy -= g * h; t += h; }
  return { x, y, z, t, angle: Math.atan2(-vy, Math.hypot(vel.x, vel.z)) * DEG };
};
const counts = {};
for (const heading of [0.35, -2.4]) {
  for (const kind of ['strafe', 'bomb', 'gunship', 'artillery']) {
    const { strike, shells } = fireRun(kind, heading);
    const footprint = runFootprint(R, kind);
    (counts[kind] ??= new Set()).add(kind === 'gunship'
      ? `${shells.filter((s) => s.name === shells[0]?.name).length}+${shells.filter((s) => s.name !== shells[0]?.name).length}` : String(shells.length));
    assert.ok(Math.abs(wrap(strike.heading - heading)) < 1e-9, 'the run heading is the caller\'s line to the mark');
    const p = pose(), at = { x: 0, y: 0, z: 0 };
    if (kind === 'strafe') {
      const every = R.strafe.fireS / (R.strafe.rounds - 1);
      let off = 0, muzzle = 0, outside = 0;
      shells.forEach(({ pos, vel }, k) => {
        runPose(R, strike, strike.landsS + k * every, p);
        // the jet on the lane's axis while it fires
        const across = (p.x - strike.x) * Math.cos(heading) - (p.z - strike.z) * Math.sin(heading);
        off = Math.max(off, Math.abs(across));
        runMuzzle(p, 'strafe', at);
        muzzle = Math.max(muzzle, Math.hypot(pos.x - at.x, pos.y - at.y, pos.z - at.z));
        // the round's straight line to the ground lands in the lane, widened by the burst's along-spread (2.5 m)
        const v = vel.clone().normalize();
        let x = pos.x, y = pos.y, z = pos.z;
        for (let i = 0; i < 4000 && y > ground(x, z); i++) { x += v.x * 0.25; y += v.y * 0.25; z += v.z * 0.25; }
        if (!footprintCovers(footprint, strike, x, z, R.strafe.spreadM * 0.5)) outside++;
      });
      assert.equal(strikeRoundPayload(shells[0].shell, strike).freeFall, 0, 'a gun round keeps its tracer');
      assert.equal(isFreeFallStore(shells[0].shell), false);
      assert.ok(off < 0.01, `the strafing jet flies the lane's axis while it fires (${off.toFixed(4)} m off)`);
      assert.ok(muzzle < 0.01, `each round leaves the GAU-8 (${muzzle.toFixed(4)} m)`);
      assert.equal(outside, 0, `every round lands in the lane (${outside} outside)`);
      if (heading === 0.35) lines.push(`strafe   rounds: ${shells.length}; the jet ${off.toFixed(4)} m off the lane's axis; muzzle ${muzzle.toFixed(4)} m; all in the lane (+2.5 m along-spread)`);
    } else if (kind === 'bomb') {
      assert.equal(shells.length, 1);
      const { pos, vel, t } = shells[0];
      const releaseS = strike.landsS + bombReleaseOffsetS(R);
      assert.ok(t >= releaseS && t - releaseS <= 1 / 60 + 1e-9, 'released in the step of the run\'s release');
      runPose(R, strike, releaseS, p);
      runMuzzle(p, 'bomb', at);
      const fromPylon = Math.hypot(pos.x - at.x, pos.y - at.y, pos.z - at.z);
      const jet = runVelocity(R, strike, releaseS, { x: 0, y: 0, z: 0 });
      const dv = Math.hypot(vel.x - jet.x, vel.y - jet.y, vel.z - jet.z);
      assert.ok(fromPylon < 0.01, `the bomb leaves the jet's pylon (${fromPylon.toFixed(4)} m)`);
      // (the solve onto its miss, at most 8 m along, and from the pylon 3.9 m to the left, over a 2.7 s fall: under 5 m/s)
      assert.ok(dv < 5, `the bomb leaves with the jet's velocity (${dv.toFixed(2)} m/s off ${Math.hypot(jet.x, jet.y, jet.z).toFixed(0)} m/s)`);
      assert.ok(airStrikeFlies('bomb') && R.bomb.speedMps >= 150, 'a fast jet drops it');
      // an unpowered store: no tracer, no motor's flame (fx/freeFallStores.ts), on the authority and on a client alike
      assert.equal(shells[0].shell.spec.flight, 'free_fall');
      assert.ok(isFreeFallStore(shells[0].shell), 'the bomb is a free-fall store by its own spec');
      const announced = strikeRoundPayload(shells[0].shell, strike);
      assert.equal(announced.freeFall, 1, 'its public announcement names it a free-fall store');
      // (a client's id space of its own here: this receipt's two runs both number their shells from 1)
      const clientShell = { id: `client-${heading}-${announced.shellId}`, spec: { type: 'HE' } };
      assert.equal(isFreeFallStore(clientShell), false);
      markFreeFallStore(clientShell.id);
      assert.ok(isFreeFallStore(clientShell), 'a client\'s shell (its type only) is one once announced');
      const land = landing(pos, vel, shells[0].shell.gravityMps2);
      assert.ok(footprintCovers(footprint, strike, land.x, land.z, 0), 'the bomb lands inside its footprint');
      assert.ok(Math.abs(t + land.t - (strike.landsS + R.fallMarginS)) < 0.02, `it lands fallMarginS after the warning (${(t + land.t - strike.landsS).toFixed(3)} s)`);
      assert.ok(land.angle >= 40, `it arrives steep (${land.angle.toFixed(1)} deg)`);
      assert.ok(footprint.shape === 'ellipse' && footprint.alongM > footprint.acrossM, 'the footprint is an ellipse long along the run');
      const miss = Math.hypot(land.x - strike.x, land.z - strike.z);
      if (heading === 0.35) lines.push(`bomb     released ${(-bombReleaseOffsetS(R)).toFixed(2)} s before the warning's end, ${bombFall(R).throwM.toFixed(0)} m short at ${R.bomb.altitudeM} m; from the pylon ${fromPylon.toFixed(4)} m, ${dv.toFixed(2)} m/s off the jet's ${Math.hypot(jet.x, jet.y, jet.z).toFixed(0)} m/s; lands ${miss.toFixed(1)} m from the mark at ${land.angle.toFixed(1)} deg, inside its ${footprint.alongM} x ${footprint.acrossM} m ellipse`);
    } else if (kind === 'gunship') {
      let ring = 0, alt = 0, wing = 0, left = Infinity;
      // the settled orbit (the bank rolls in over its first 1.2 s and out over its last)
      for (let t = strike.landsS + 1.25; t <= strike.landsS + R.gunship.orbitS - 1.25; t += 0.25) {
        runPose(R, strike, t, p);
        ring = Math.max(ring, Math.abs(Math.hypot(p.x - strike.x, p.z - strike.z) - footprint.radiusM));
        alt = Math.max(alt, Math.abs(p.y - strike.y - R.gunship.altitudeM));
        // the left wing (banked) and the line from the aircraft to the mark
        const cb = Math.cos(p.bank), sb = Math.sin(p.bank);
        const lx = Math.cos(p.yaw) * cb, ly = sb, lz = -Math.sin(p.yaw) * cb;
        const mx = strike.x - p.x, my = strike.y - p.y, mz = strike.z - p.z, mm = Math.hypot(mx, my, mz);
        wing = Math.max(wing, Math.acos(Math.min(1, (lx * mx + ly * my + lz * mz) / mm)) * DEG);
      }
      for (const { shell, pos, t } of shells) {
        runPose(R, strike, t, p);
        left = Math.min(left, (pos.x - p.x) * Math.cos(p.yaw) - (pos.z - p.z) * Math.sin(p.yaw));
        assert.ok(shell.vel.y < 0, 'its rounds fire down onto the ring');
      }
      assert.equal(footprint.shape, 'orbit');
      assert.ok(ring < 0.01, `the AC-130 flies its footprint's ring (${ring.toFixed(4)} m off)`);
      assert.ok(alt < 0.01, `at its altitude over the mark (${alt.toFixed(4)} m)`);
      assert.ok(wing < 3, `its guns' line to the mark lies along its left wing (${wing.toFixed(2)} deg)`);
      assert.ok(left > 0, 'every round leaves its left side');
      if (heading === 0.35) lines.push(`gunship  ring ${footprint.radiusM} m: ${ring.toFixed(4)} m off it, ${alt.toFixed(4)} m off ${R.gunship.altitudeM} m; bank ${(Math.atan(R.gunship.speedMps ** 2 / (9.81 * footprint.radiusM)) * DEG).toFixed(1)} deg; the guns' line ${wing.toFixed(2)} deg off the left wing; ${shells.length} rounds from its left side`);
    } else {
      let outside = 0;
      for (const { shell, pos, vel } of shells) {
        const land = landing(pos, vel, shell.gravityMps2);
        if (!footprintCovers(footprint, strike, land.x, land.z, 0.5)) outside++;
      }
      assert.equal(outside, 0, 'every battery round lands in its circle');
      assert.equal(airStrikeFlies('artillery'), false, 'the battery has no aircraft');
      if (heading === 0.35) lines.push(`artillery ${shells.length} rounds, all in its ${footprint.radiusM} m circle; no aircraft`);
    }
  }
}
// the authored counts (improve-271 plan 007), one strike each
assert.deepEqual([...counts.strafe], ['28']);
assert.deepEqual([...counts.bomb], ['1']);
assert.deepEqual([...counts.artillery], ['10']);
assert.deepEqual([...counts.gunship], ['60+7']);
assert.ok(AIR_STRIKE_KINDS.every((kind) => runFootprint(R, kind)), 'every kind has its footprint from its run');

console.log(lines.join('\n'));
console.log(`strikeRuns: every run's flight is continuous and lined up; its footprint and release points lie on it; counts 28 / 1 / 10 / 60+7`);
