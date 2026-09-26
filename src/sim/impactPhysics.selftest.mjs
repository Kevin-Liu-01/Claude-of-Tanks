// Impact physics (owner 2026-09-25) — the movement side: landings rebound by the ruleset's restitution and
// decay to a settle (Mars, Turbo Ball) while the whole game barely hops; the contact is swept so a 40 m/s fall
// never ends a step under the ground or under a structure top and the rebound is the same at any step size;
// a 40 m/s drive into a wall or a terrain cliff stops on the near side and reports its source; faces steeper
// than the tracks hold slide instead of hovering; a parked hull holds its grade without creep; the yaw rate at
// speed is bounded by lateral grip; a wreck keeps its momentum through a landing; a nose-first landing pitches.
// Run: node src/sim/impactPhysics.selftest.mjs
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import {
  createTankState, updateTank, SIM_DT, requestTankJump, resetTankVerticalState,
  IMPACT_SOURCE_CLIFF, IMPACT_SOURCE_COLLIDER, IMPACT_SOURCE_NONE,
} from './movement.ts';
import { matchRulesetFor, STANDARD_PHYSICS } from './matchRuleset.ts';
import { createStructureSupportField } from './structureSupport.ts';

const near = (actual, expected, tol, message) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${message} — expected ${expected} ±${tol}, got ${actual}`);

// the movement receipt's medium-tank fixture, with a top speed high enough for the 40 m/s wall test
const SPEC = {
  name: 'fixture-medium', enginePowerHp: 500, weightTons: 33, topSpeedKmh: 42, reverseSpeedKmh: 15,
  hullTraverseDegS: 36, turretTraverseDegS: 36, gunPitchDegS: 24, gunElevationDeg: 25, gunDepressionDeg: 10,
  pivotStyle: 'pivot', terrainResistance: { hard: 1.0, medium: 1.2, soft: 2.2 },
  dims: { hullLengthM: 6.27, overallLengthM: 7.52, widthM: 3.0, heightM: 2.97 },
  gun: { caliberMm: 76, baseAccuracy: 0.38, aimTimeS: 2.3, reloadS: 6, bloom: { move: 0.2, hullRot: 0.2, turret: 0.12, afterShot: 4 } },
  armor: {
    boundingRadiusM: 3.8, turretPivot: [0, 1.55, 0], gunPivot: [0, 0.25, 0.3], gunBarrel: { lengthM: 4.0 },
    bodyContactPoints: {
      hull: [-1.42, 0.42, -2.75, 1.42, 0.42, -2.75, -1.42, 1.48, -2.75, 1.42, 1.48, -2.75, -1.42, 0.42, 2.75, 1.42, 0.42, 2.75, -1.42, 1.48, 2.75, 1.42, 1.48, 2.75],
      turret: [-0.82, 0.02, -0.95, 0.82, 0.02, -0.95, -0.72, 0.60, -0.82, 0.72, 0.60, -0.82, -0.82, 0.02, 0.82, 0.82, 0.02, 0.82, -0.72, 0.60, 0.72, 0.72, 0.60, 0.72],
    },
  },
};
const FAST_SPEC = { ...SPEC, topSpeedKmh: 160 };

const flat = () => 0;
function makeField(fn, groundType = 'medium') {
  return { getHeightAt: fn, getNormalAt: () => null, getGroundType: () => groundType };
}
function makeEntity(field, { x = 0, z = 0, yaw = 0, spec = SPEC, mode = 'standard', gravityScale = null } = {}) {
  const ruleset = matchRulesetFor(mode);
  const pos = new Vector3(x, field.getHeightAt(x, z), z);
  return {
    spec, state: createTankState(spec, pos, yaw),
    input: { throttle: 0, steer: 0, brake: false, aimPoint: null }, combat: null,
    modeGravityScale: gravityScale ?? ruleset.gravityScale, modePhysics: ruleset.physics,
  };
}
function settle(entity, field, ticks = 120, collide = null) {
  for (let i = 0; i < ticks; i++) updateTank(entity, field, SIM_DT, collide);
}
/** Seat a hull on a slope the way a spawn pad would: the attitude preset to the fitted plane (no spring swing
 * from level), the ride reset onto the support solve's seat, then a short settle. */
function seat(entity, field, ticks = 120) {
  const state = entity.state;
  updateTank(entity, field, SIM_DT);
  state._spring.pitch = state._terr.pitch; state._spring.roll = state._terr.roll;
  state._spring.pitchV = 0; state._spring.rollV = 0;
  state.visualPitch = state._terr.pitch; state.visualRoll = state._terr.roll;
  state._sup.x = NaN; // re-solve the support at the preset pose
  updateTank(entity, field, SIM_DT);
  resetTankVerticalState(state, state._sup.y, 0, true);
  settle(entity, field, ticks);
}
function run(entity, field, ticks, onTick = null, collide = null, dt = SIM_DT) {
  for (let i = 0; i < ticks; i++) {
    updateTank(entity, field, dt, collide);
    if (onTick) onTick(i);
  }
}

/** Jump and record the flight: apex per hop, landings (closing speeds), bounces, the lowest clearance. */
function flight(entity, field, jumpMps, { dt = SIM_DT, maxS = 20 } = {}) {
  assert.ok(requestTankJump(entity.state, jumpMps), 'the jump is accepted');
  const state = entity.state;
  const apexes = [];
  const landings = [];
  let peak = -Infinity;
  let minClearance = Infinity;
  let bounces = 0;
  let ticks = 0;
  const ground = field.getHeightAt(state.pos.x, state.pos.z);
  while (ticks < maxS / dt) {
    const before = state.grounded;
    updateTank(entity, field, dt, null);
    ticks++;
    if (state.pos.y > peak) peak = state.pos.y;
    minClearance = Math.min(minClearance, state.pos.y - ground);
    if (state.landingImpactMps > 0) {
      landings.push(state.landingImpactMps);
      apexes.push(peak - ground);
      peak = -Infinity;
    }
    bounces = Math.max(bounces, state._ride.bounces);
    if (!before && state.grounded && landings.length) break;
  }
  return { apexes, landings, bounces, minClearance, ticks, timeS: ticks * dt };
}

// ---- 1. Mars: several decaying bounces, then a settle -------------------------------------------------------
{
  const field = makeField(flat);
  const entity = makeEntity(field, { mode: 'mars' });
  settle(entity, field);
  const y0 = entity.state.pos.y;
  const jump = matchRulesetFor('mars').jumpMps;
  const trace = flight(entity, field, jump);
  assert.ok(trace.bounces >= 2, `a Mars rocket jump rebounds at least twice (${trace.bounces})`);
  assert.ok(trace.apexes.length >= 3, `apex per hop: ${trace.apexes.map((a) => a.toFixed(2)).join(' > ')} m`);
  for (let i = 1; i < trace.apexes.length; i++) {
    assert.ok(trace.apexes[i] < trace.apexes[i - 1] * 0.5, `each hop is under half the last (${trace.apexes[i - 1].toFixed(2)} → ${trace.apexes[i].toFixed(2)})`);
  }
  near(trace.landings[0], jump, 0.4, 'the first landing closes at the launch speed (energy conservation at 0.38 g)');
  near(trace.landings[1], jump * 0.5, 0.4, 'the second at the ruleset restitution × the first');
  assert.ok(entity.state.grounded, 'the hull settles');
  near(entity.state.pos.y, y0 + 0.18, 0.03, 'on the droop line (the tracks touch first)');
  run(entity, field, 120);
  near(entity.state.pos.y, y0, 0.03, 'then the loaded suspension compresses it back onto its seat');
  assert.ok(trace.minClearance > -0.02, `the ride never ends a step below the ground (${trace.minClearance.toFixed(3)} m)`);
  // at rest again: no jitter once the attitude spring's tail has died (four seconds after the settle)
  run(entity, field, 120);
  const ys = [];
  run(entity, field, 120, () => ys.push(entity.state.pos.y));
  assert.ok(Math.max(...ys) - Math.min(...ys) < 1e-3, `no vertical jitter at rest after the bounces (${((Math.max(...ys) - Math.min(...ys)) * 1000).toFixed(2)} mm over 2 s)`);
  assert.equal(entity.state.speed, 0, 'and no drive creep');
  assert.equal(entity.state._ride.bounces, 0, 'the bounce count clears on the settle');
}

// ---- 2. Turbo Ball bounces too; the whole game barely hops --------------------------------------------------
{
  const field = makeField(flat);
  const turbo = makeEntity(field, { mode: 'turbo_ball' });
  settle(turbo, field);
  const trace = flight(turbo, field, matchRulesetFor('turbo_ball').jumpMps);
  assert.ok(trace.bounces >= 2, `a Turbo Ball jump rebounds (${trace.bounces})`);
  assert.ok(turbo.state.grounded, 'and settles');

  const standard = makeEntity(field, { mode: 'standard' });
  settle(standard, field);
  const plain = flight(standard, field, 6);
  assert.equal(plain.bounces, 0, 'a 6 m/s landing at 1 g settles on the tracks: 0.15 × 6 is under the 1.2 m/s rebound floor');
  assert.ok(standard.state.grounded && plain.landings.length === 1, 'one landing, grounded');
  const big = makeEntity(field, { mode: 'standard' });
  settle(big, field);
  const drop = flight(big, field, 12);
  assert.ok(drop.bounces >= 1 && drop.bounces <= 2, `a 12 m/s landing hops once or twice at 1 g (${drop.bounces})`);
  // the hop is measured from the ground; the hull leaves from the 0.18 m droop line, so 0.15 × 12 = 1.8 m/s rises 0.165 m above it
  near(drop.apexes[1] - 0.18, 1.8 * 1.8 / (2 * 9.81), 0.03, 'the hop above the droop line is the rebound\'s ballistic apex');
}

// ---- 3. no tunnelling at 40 m/s: a fall onto terrain, a fall onto a structure top -----------------------------
{
  const field = makeField(flat);
  const entity = makeEntity(field, { mode: 'standard' });
  settle(entity, field);
  const seat = entity.state.pos.y;
  resetTankVerticalState(entity.state, seat + 82, 0, false);
  let minY = Infinity;
  let landing = 0;
  let landedAt = -1;
  run(entity, field, 600, (i) => {
    minY = Math.min(minY, entity.state.pos.y);
    if (entity.state.landingImpactMps > 0 && landedAt < 0) { landing = entity.state.landingImpactMps; landedAt = i; }
  });
  assert.ok(landedAt > 0, 'the fall lands');
  near(landing, Math.sqrt(2 * 9.81 * (82 - 0.18)), 1.2, 'the swept contact reads the true closing speed of an 82 m fall (~40 m/s)');
  assert.ok(minY >= seat - 0.02, `the ride never tunnels under the terrain (${(minY - seat).toFixed(3)} m)`);
  assert.ok(entity.state.grounded, 'and it is grounded at the end');
  near(entity.state.pos.y, seat, 0.03, 'resting on its seat');
}
{
  // a structure top: an OBB primitive 5 m tall under the falling hull (round 30 structure support)
  const terrain = makeField(flat);
  const record = { min: [-6, 0, -6], max: [6, 5, 6], shape2: { kind: 'obb', cx: 0, cz: 0, hw: 6, hl: 6, yaw: 0 } };
  const support = createStructureSupportField(terrain, { getObstacles: () => [record] });
  const entity = makeEntity(terrain, { mode: 'standard' });
  entity.state.pos.y = 5;
  resetTankVerticalState(entity.state, 5 + 60, 0, false);
  let minY = Infinity;
  for (let i = 0; i < 600; i++) {
    support.beginHull(entity.state.pos.x, entity.state.pos.z, entity.state.pos.y);
    updateTank(entity, support, SIM_DT, null);
    minY = Math.min(minY, entity.state.pos.y);
  }
  assert.ok(minY >= 5 - 0.02, `a 34 m/s fall onto a roof stops on the roof (${minY.toFixed(3)} m)`);
  assert.ok(entity.state.grounded && entity.state.pos.y >= 5 - 0.02, 'and stands on it');
}

// ---- 4. no tunnelling at 40 m/s: a wall (collider) and a terrain cliff --------------------------------------
{
  const field = makeField(flat);
  const entity = makeEntity(field, { spec: FAST_SPEC, mode: 'standard' });
  settle(entity, field);
  const halfLen = FAST_SPEC.dims.hullLengthM * 0.5;
  const wallZ = 30;
  // a plane wall at z = wallZ: push the hull rectangle back out along −z
  const collide = (pos, _radius, outPush) => {
    const front = pos.z + halfLen;
    if (front <= wallZ) return false;
    outPush.set(0, 0, wallZ - front);
    return true;
  };
  entity.state.speed = 40;
  let maxFront = -Infinity;
  let source = IMPACT_SOURCE_NONE;
  let peakImpact = 0;
  let nx = 0, nz = 0;
  run(entity, field, 120, () => {
    maxFront = Math.max(maxFront, entity.state.pos.z + halfLen);
    if (entity.state.impactMps > peakImpact) {
      peakImpact = entity.state.impactMps;
      source = entity.state.impactSource;
      nx = entity.state.impactNx; nz = entity.state.impactNz;
    }
    // hold the drive on the wall like a player would
    entity.input.throttle = 1;
  }, collide);
  assert.ok(maxFront <= wallZ + 0.02, `the hull front never passes the wall (${(maxFront - wallZ).toFixed(3)} m)`);
  assert.ok(peakImpact > 15, `the blocked closing speed is reported (${peakImpact.toFixed(1)} m/s)`);
  assert.equal(source, IMPACT_SOURCE_COLLIDER, 'attributed to the collider');
  near(nx, 0, 1e-9); near(nz, -1, 1e-9, 'the push direction points back out of the wall');
  assert.ok(Math.abs(entity.state.speed) < 0.5, 'and the hull is stopped against it');
}
{
  // a terrain cliff: a 12 m wall rising at z = 30 (grade far past tan 52°), the hull driving at 40 m/s
  const field = makeField((x, z) => (z > 30 ? 12 : 0));
  const entity = makeEntity(field, { spec: FAST_SPEC, mode: 'standard' });
  settle(entity, field);
  entity.state.speed = 40;
  let source = IMPACT_SOURCE_NONE;
  let peak = 0;
  run(entity, field, 120, () => {
    if (entity.state.impactMps > peak) { peak = entity.state.impactMps; source = entity.state.impactSource; }
  });
  assert.equal(source, IMPACT_SOURCE_CLIFF, 'a terrain wall reports the cliff source');
  assert.ok(peak > 30, `at the full closing speed (${peak.toFixed(1)} m/s)`);
  assert.ok(entity.state.pos.z + FAST_SPEC.dims.hullLengthM * 0.5 < 30 + 1.6, 'the hull stops at the foot of the face');
  assert.ok(entity.state.pos.y < 1, 'and never rides up it');
}

// ---- 5. slope traction: a 30° grade drives, a 48° face slides ------------------------------------------------
{
  const slope = (deg) => makeField((x, z) => Math.tan(deg * Math.PI / 180) * z);
  // 30°: climbable at full throttle, and a parked hull holds it on the brake
  const climbField = slope(30);
  const climber = makeEntity(climbField, { mode: 'standard' });
  seat(climber, climbField);
  const z0 = climber.state.pos.z;
  climber.input.throttle = 1;
  run(climber, climbField, 300);
  // the 15 hp/t fixture's rated speed on a 30° medium grade is ~1.6 m/s (uphillDriveMargin 0.135): it climbs, slowly
  assert.ok(climber.state.speed > 0.3 && climber.state.pos.z > z0 + 0.5, `a 30° grade is climbed (${climber.state.speed.toFixed(2)} m/s, ${(climber.state.pos.z - z0).toFixed(2)} m in 5 s)`);
  assert.equal(climber.state.slopeBlocked, false, 'and is not reported blocked');
  // 48°: past the tracks' hold (tan 48° ≈ 1.11 > 0.9) and under the cliff grade (1.28) — no drive, no brake
  const faceField = slope(48);
  const slider = makeEntity(faceField, { mode: 'standard' });
  seat(slider, faceField, 6);
  slider.input.throttle = 1;
  let blocked = false;
  const speeds = [];
  const pitches = [];
  run(slider, faceField, 180, () => { blocked ||= slider.state.slopeBlocked; speeds.push(slider.state.speed); pitches.push(slider.state._terr.pitch); });
  assert.ok(blocked, 'the face is reported blocked (the bots run their recovery)');
  assert.ok(slider.state.speed < -3, `full throttle up a 48° face still slides down (${slider.state.speed.toFixed(2)} m/s)`);
  assert.ok(speeds[90] < speeds[60] && speeds[60] < speeds[30], 'the slide accelerates');
  // gravity's pull along the plane the hull fits, against sliding friction μ·g·cos θ (μ = 0.24 / 1.2 on medium
  // ground), measured before the top-speed cap (1.2 × 42 km/h = 14 m/s) can bite
  const g = 9.81, theta = pitches[60];
  assert.ok(theta > 0.7, `the hull sits on the face (fitted pitch ${(theta * 180 / Math.PI).toFixed(1)}°)`);
  const expectedAccel = g * Math.sin(theta) - (0.24 / 1.2) * g * Math.cos(theta);
  const measuredAccel = -(speeds[90] - speeds[30]) / (60 * SIM_DT);
  near(measuredAccel, expectedAccel, 0.4, `the slide is gravity minus friction (pull ${(g * Math.sin(theta)).toFixed(2)} m/s²)`);
  assert.ok(Math.abs(speeds[179]) > 5, `a slide is not bounded by the reverse gear (${speeds[179].toFixed(2)} m/s after 3 s)`);
  slider.input.throttle = 0;
  slider.input.brake = true;
  run(slider, faceField, 60);
  assert.ok(slider.state.speed < -5, `the brake cannot hold a face the tracks do not grip (${slider.state.speed.toFixed(2)} m/s a second later)`);
}

// ---- 6. static hold: a parked hull on a 15° grade neither creeps nor jitters --------------------------------
{
  const field = makeField((x, z) => Math.tan(15 * Math.PI / 180) * z);
  const parked = makeEntity(field, { mode: 'standard' });
  seat(parked, field, 240);
  const z0 = parked.state.pos.z;
  const y0 = parked.state.pos.y;
  let maxSpeed = 0;
  let maxDy = 0;
  run(parked, field, 600, () => {
    maxSpeed = Math.max(maxSpeed, Math.abs(parked.state.speed));
    maxDy = Math.max(maxDy, Math.abs(parked.state.pos.y - y0));
  });
  assert.equal(parked.state.speed, 0, 'a coasting hull on 15° holds exactly still');
  assert.equal(maxSpeed, 0, 'it never creeps');
  near(parked.state.pos.z, z0, 1e-9, 'and never moves');
  assert.ok(maxDy < 1e-4, `no vertical jitter (${maxDy.toExponential(2)} m)`);
  // 30° without the brake: the grade's pull beats the coast decel, the hull rolls back — the brake holds it
  const steep = makeField((x, z) => Math.tan(30 * Math.PI / 180) * z);
  const roller = makeEntity(steep, { mode: 'standard' });
  seat(roller, steep, 60);
  run(roller, steep, 120);
  assert.ok(roller.state.speed < -0.5, `30° in neutral rolls back (${roller.state.speed.toFixed(2)} m/s)`);
  roller.input.brake = true;
  run(roller, steep, 240);
  assert.equal(roller.state.speed, 0, 'the brake holds a 30° grade');
}

// ---- 7. lateral grip: no pirouettes at 60 km/h --------------------------------------------------------------
{
  const field = makeField(flat, 'hard');
  const yawRateAt = (kmh) => {
    const entity = makeEntity(field, { spec: FAST_SPEC, mode: 'standard' });
    settle(entity, field);
    entity.input.throttle = 1;
    entity.input.steer = 1;
    const mps = kmh / 3.6;
    run(entity, field, 120, () => { entity.state.speed = mps; });
    return Math.abs(entity.state.yawRate);
  };
  const slow = yawRateAt(20), fast = yawRateAt(60);
  const nominal = FAST_SPEC.hullTraverseDegS * Math.PI / 180;
  near(slow, nominal * (1 - 0.2 * (20 / 160) ** 2), 0.03, 'at 20 km/h the hull turns at its rated rate');
  assert.ok(fast < slow * 0.75, `at 60 km/h the yaw rate is bounded by lateral grip (${(fast * 180 / Math.PI).toFixed(1)} vs ${(slow * 180 / Math.PI).toFixed(1)} deg/s)`);
  near(fast, 7 / (60 / 3.6), 0.01, 'the cap is 7 m/s² of lateral acceleration on hard ground: v·ω = 7');
  const radius = (60 / 3.6) / fast;
  assert.ok(radius > 35 && radius < 60, `a 60 km/h turn is a ${radius.toFixed(0)} m circle, not a pirouette`);
  assert.ok(fast >= nominal * 0.3 - 1e-9, 'and never under the steering floor');
  // Mars: less grip under 0.38 g — wider still
  const marsEntity = makeEntity(field, { spec: FAST_SPEC, mode: 'mars' });
  settle(marsEntity, field);
  marsEntity.input.throttle = 1; marsEntity.input.steer = 1;
  run(marsEntity, field, 120, () => { marsEntity.state.speed = 60 / 3.6; });
  assert.ok(Math.abs(marsEntity.state.yawRate) < fast, 'low gravity turns wider at the same speed');
}

// ---- 8. a wreck keeps its momentum through a landing ----------------------------------------------------------
{
  const field = makeField(flat);
  const wreck = makeEntity(field, { mode: 'standard' });
  wreck.combat = { destroyed: true, modules: {}, crew: {} };
  settle(wreck, field);
  wreck.state.speed = 8;
  requestTankJump(wreck.state, 5);
  let landedTick = -1;
  let speedAtLanding = 0;
  let speedHalfSecondLater = 0;
  run(wreck, field, 240, (i) => {
    if (wreck.state.landingImpactMps > 0 && landedTick < 0) { landedTick = i; speedAtLanding = wreck.state.speed; }
    if (landedTick >= 0 && i === landedTick + 30) speedHalfSecondLater = wreck.state.speed;
  });
  assert.ok(landedTick > 5, 'the wreck flew');
  near(speedAtLanding, 8, 0.05, 'the wreck keeps its horizontal momentum in the air and through the landing');
  near(speedHalfSecondLater, 8 - 4.5 * 0.5, 0.6, 'then skids on locked tracks at the wreck decel (4.5 m/s²)');
  assert.equal(wreck.state.speed, 0, 'and comes to rest');
}

// ---- 9. the landing torque turns a nose-first hull toward the ground plane ------------------------------------
{
  const field = makeField(flat);
  const entity = makeEntity(field, { mode: 'mars' });
  settle(entity, field);
  requestTankJump(entity.state, 9.5);
  run(entity, field, 10);
  entity.state._spring.pitch = -0.3; // nose down in flight
  entity.state.visualPitch = -0.3;
  let landed = false;
  let pitchRateAfter = 0;
  run(entity, field, 600, () => {
    if (!landed && entity.state.landingImpactMps > 0) { landed = true; }
    else if (landed && pitchRateAfter === 0) pitchRateAfter = entity.state._spring.pitchV;
  });
  assert.ok(landed, 'landed');
  assert.ok(pitchRateAfter > 0.05, `a nose-first landing pitches the nose up (${pitchRateAfter.toFixed(3)} rad/s)`);
}

// ---- 10. step-size independence of the swept landing ----------------------------------------------------------
{
  const field = makeField(flat);
  const trace = (dt) => {
    const entity = makeEntity(field, { mode: 'mars' });
    settle(entity, field);
    return flight(entity, field, 9.5, { dt });
  };
  const a = trace(1 / 60), b = trace(1 / 120);
  assert.equal(a.bounces, b.bounces, 'the same number of rebounds at 60 and 120 steps per second');
  near(a.landings[0], b.landings[0], 0.15, 'the same first closing speed');
  near(a.apexes[0], b.apexes[0], 0.15, 'the same first apex');
  near(a.apexes[1], b.apexes[1], 0.15, 'the same rebound apex');
  near(a.timeS, b.timeS, 0.25, 'the same flight time to the settle');
}

// ---- 11. the whole-game block is the movement default ----------------------------------------------------------
{
  const field = makeField(flat);
  const bare = { spec: SPEC, state: createTankState(SPEC, new Vector3(0, 0, 0), 0), input: { throttle: 0, steer: 0, brake: false, aimPoint: null }, combat: null };
  settle(bare, field);
  const trace = flight(bare, field, 6);
  assert.equal(trace.bounces, 0, 'an entity without a physics block plays the whole-game rebound');
  assert.equal(STANDARD_PHYSICS.restitution, 0.15);
}

console.log('impactPhysics.selftest: Mars/Turbo bounces decay and settle, 1 g barely hops, no tunnelling at 40 m/s (terrain, roof, wall, cliff), slope slide and hold, lateral grip, wreck momentum, landing torque and step-size independence pass');
