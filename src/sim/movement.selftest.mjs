/**
 * movement.selftest.mjs — standalone verification of tank movement, hull
 * attitude, sprung-mass heave, and TERRAIN CONTACT. The chassis may now move
 * inside the visible suspension envelope; the wheels and deforming belt own
 * final contact instead of a rigid root plane tracing the heightfield.
 * Run with: node src/sim/movement.selftest.mjs
 * Exits 0 quietly on pass, non-zero with messages on failure.
 * Uses inline fixtures only — no dependency on vehicles/specs.ts.
 */

import { Euler, Quaternion, Vector3 } from 'three';
import {
  createTankState, fireRecoil, resetTankVerticalState, shotRecoilScale,
  IFV_AUTOCANNON_AFTER_SHOT_BLOOM, IFV_AUTOCANNON_RECOIL_SCALE,
  updateTank, SIM_DT, requestTankJump, applyShellKnock, shellKnockMps, cliffAhead } from './movement.ts';
import { requestTankSelfRight } from './rollover.ts';

// ---------------------------------------------------------------- harness --
let failures = 0;
let checks = 0;

function assert(cond, msg) {
  checks++;
  if (!cond) {
    failures++;
    console.error(`FAIL: ${msg}`);
  }
}

function near(actual, expected, tol, msg) {
  assert(
    Math.abs(actual - expected) <= tol,
    `${msg} — expected ${expected} ±${tol}, got ${actual}`
  );
}

// ---------------------------------------------------------------- fixtures --
// Medium-tank fixture (M4A3E8-flavored numbers; matches the tankFactory model
// proportions the contact solve targets: contact plane at hull-local y = 0,
// track bottom run spanning ±0.45 × hullLengthM, outer edge at ±0.5 × widthM).
const SPEC = {
  name: 'fixture-medium',
  enginePowerHp: 500,
  weightTons: 33,
  topSpeedKmh: 42,
  reverseSpeedKmh: 15,
  hullTraverseDegS: 36,
  turretTraverseDegS: 36,
  gunPitchDegS: 24,
  gunElevationDeg: 25,
  gunDepressionDeg: 10,
  pivotStyle: 'pivot',
  terrainResistance: { hard: 1.0, medium: 1.2, soft: 2.2 },
  dims: { hullLengthM: 6.27, overallLengthM: 7.52, widthM: 3.0, heightM: 2.97 },
  gun: {
    caliberMm: 76,
    baseAccuracy: 0.38,
    aimTimeS: 2.3,
    bloom: { move: 0.2, hullRot: 0.2, turret: 0.12, afterShot: 4 },
  },
  armor: {
    boundingRadiusM: 3.8,
    turretPivot: [0, 1.55, 0],
    gunPivot: [0, 0.25, 0.3],
    gunBarrel: { lengthM: 4.0 },
    // Exact structural contact envelope used only once the hull leaves its
    // normal running-gear support. The roof-down height is 1.55 + 0.60 =
    // 2.15 m; spec.dims.heightM deliberately includes non-load-bearing roof
    // dressing and must never become an invisible rollover box.
    bodyContactPoints: {
      hull: [
        -1.42, 0.42, -2.75, 1.42, 0.42, -2.75,
        -1.42, 1.48, -2.75, 1.42, 1.48, -2.75,
        -1.42, 0.42, 2.75, 1.42, 0.42, 2.75,
        -1.42, 1.48, 2.75, 1.42, 1.48, 2.75,
      ],
      turret: [
        -0.82, 0.02, -0.95, 0.82, 0.02, -0.95,
        -0.72, 0.60, -0.82, 0.72, 0.60, -0.82,
        -0.82, 0.02, 0.82, 0.82, 0.02, 0.82,
        -0.72, 0.60, 0.72, 0.72, 0.60, 0.72,
      ],
    },
  },
};

function makeField(fn, groundType = 'medium') {
  return {
    getHeightAt: fn,
    getNormalAt: () => null,
    getGroundType: () => groundType,
  };
}

function makeEntity(field, x = 0, z = 0, yaw = 0, spec = SPEC) {
  const pos = new Vector3(x, field.getHeightAt(x, z), z);
  return {
    spec,
    state: createTankState(spec, pos, yaw),
    input: { throttle: 0, steer: 0, brake: false, aimPoint: null },
    combat: null,
  };
}

// ---------------------------------------------------------------- contact --
// Dense rendered-geometry contact check. The renderer composes the hull pose
// as rotation.set(-(visualPitch + suspP·SUSP_VIS_P) + flinchP, yaw,
// visualRoll + suspR·SUSP_VIS_R + sway·SWAY_VIS + flinchR, 'YXZ') with root at
// state.pos (tankFactory syncFromState: sim attitude plus the VISIBILITY-
// AMPLIFIED susp-rock spring and turn-lean sway, plus the hit-flinch rock —
// all mirrored by the sim in state._susp/_swayEst/_flinch; amplification
// constants in lockstep with tankFactory SUSP_VIS_P/SUSP_VIS_R/SWAY_VIS) and
// the track contact plane at hull-local y = 0 — so a contact point at
// hull-local (x, 0, z) renders at:
//   worldY = pos.y + x·sin(roll)·cos(pitch) + z·sin(pitch)
//   worldXZ per the same YXZ composition.
// We sample BOTH track lines at 0.1 m spacing (3.5× denser than the solve) and
// report the worst penetration (< 0 gap) and the smallest root-plane gap.
// During motion that plane may sit inside the ±suspension travel envelope;
// procedural/GLB wheels and track belts deform by the matching amount.
const SUSP_VIS_P = 2.6;
const SUSP_VIS_R = 2.1;
// MOVEMENT r1: 2.3 was a stale mirror — movement.ts/tankFactory lock SWAY_VIS
// at 3.2 (effects_combat r1), so floats during hard turns were under-measured.
const SWAY_VIS = 3.2;
function contactStats(state, field) {
  const hw = 0.5 * SPEC.dims.widthM;
  const sl = 0.45 * SPEC.dims.hullLengthM;
  const fl = state._flinch || { p: 0, r: 0 };
  const pitch = state.visualPitch + state._susp.p * SUSP_VIS_P - fl.p;
  const roll = state.visualRoll + state._susp.r * SUSP_VIS_R + state._swayEst * SWAY_VIS + fl.r;
  const cb = Math.cos(state.yaw), sb = Math.sin(state.yaw);
  const ca = Math.cos(-pitch), sa = Math.sin(-pitch);
  const cr = Math.cos(roll), sr = Math.sin(roll);
  const sinP = Math.sin(pitch), cosP = Math.cos(pitch);
  const sinR = Math.sin(roll);
  let minGap = Infinity;
  // MOVEMENT r1: sample the EXACT line ends too — 2·sl is not a multiple of
  // the 0.1 m step, so the walk used to stop 4.3 cm short of +sl. The solve's
  // touching sample often IS the line end (crest exits), and the truncated
  // grid read up to ~4 cm of phantom float there.
  const zs = [];
  for (let z = -sl; z < sl; z += 0.1) zs.push(z);
  zs.push(sl);
  for (const side of [-1, 1]) {
    const x = side * hw;
    const x1 = x * cr, y1 = x * sr;
    for (const z of zs) {
      const z2 = y1 * sa + z * ca;
      const wx = state.pos.x + x1 * cb + z2 * sb;
      const wz = state.pos.z - x1 * sb + z2 * cb;
      const worldY = state.pos.y + x * sinR * cosP + z * sinP;
      const gap = worldY - field.getHeightAt(wx, wz);
      if (gap < minGap) minGap = gap;
    }
  }
  return { penetration: Math.max(0, -minGap), minGap };
}

function run(ent, field, ticks, perTick = null) {
  for (let i = 0; i < ticks; i++) {
    updateTank(ent, field, SIM_DT);
    if (perTick) perTick(i);
  }
}

function gunPoseWorld(state) {
  const hull = new Quaternion().setFromEuler(new Euler(
    -state.visualPitch, state.yaw, state.visualRoll, 'YXZ',
  ));
  const origin = new Vector3(...SPEC.armor.gunPivot)
    .applyAxisAngle(new Vector3(0, 1, 0), state.turretYaw)
    .add(new Vector3(...SPEC.armor.turretPivot))
    .applyQuaternion(hull)
    .add(state.pos);
  const direction = new Vector3(
    Math.sin(state.turretYaw) * Math.cos(state.gunPitch),
    Math.sin(state.gunPitch),
    Math.cos(state.turretYaw) * Math.cos(state.gunPitch),
  ).applyQuaternion(hull).normalize();
  return { origin, direction };
}

// ---------------------------------------------------------------- 1. flat --
{
  const field = makeField(() => 2.0);
  const ent = makeEntity(field, 0, 0, 0.3);
  run(ent, field, 180);
  near(ent.state.pos.y, 2.015, 0.01, 'flat ground: hull sits on the plane (+contact margin)');
  near(ent.state.visualPitch, 0, 0.005, 'flat ground: no pitch');
  near(ent.state.visualRoll, 0, 0.005, 'flat ground: no roll');
  const { penetration, minGap } = contactStats(ent.state, field);
  assert(penetration < 0.01, `flat ground: no penetration (got ${penetration.toFixed(3)} m)`);
  assert(minGap < 0.03, `flat ground: tracks touch (min gap ${minGap.toFixed(3)} m)`);
}

// ---------------------------------------------- 2. side slope (roll sign) --
// h = 0.25·x (14° cross slope), tank facing +Z: ground is HIGHER on the RIGHT
// (+x). Under the renderer composition positive roll lifts the right side, so
// the settled roll must be ≈ +atan(0.25). The pre-fix inverted fit leaned the
// hull INTO the slope and buried one track ~0.5–1 m (r5 static failure case).
{
  const field = makeField((x) => 0.25 * x);
  const ent = makeEntity(field, 0, 0, 0);
  run(ent, field, 600);
  near(ent.state.visualRoll, Math.atan(0.25), 0.02, 'side slope: roll conforms (sign + magnitude)');
  const { penetration, minGap } = contactStats(ent.state, field);
  assert(penetration < 0.03, `side slope: no track buried (pen ${penetration.toFixed(3)} m)`);
  assert(minGap < 0.03, `side slope: no track floating (min gap ${minGap.toFixed(3)} m)`);
}

// --------------------------------------------------- 3. uphill (pitch sign) --
{
  const field = makeField((x, z) => 0.3 * z);
  const ent = makeEntity(field, 0, 0, 0);
  run(ent, field, 600);
  near(ent.state.visualPitch, Math.atan(0.3), 0.02, 'uphill: nose-up pitch conforms');
  const { penetration, minGap } = contactStats(ent.state, field);
  assert(penetration < 0.03, `uphill: no penetration (pen ${penetration.toFixed(3)} m)`);
  assert(minGap < 0.03, `uphill: contact held (min gap ${minGap.toFixed(3)} m)`);
}

// ------------------------------------- 4. live drives over sine bump fields --
// Critic-specified synthetic fields: bumps + gullies at 2–8 m wavelengths.
// Amplitudes follow the game's spectral falloff (fine wavelengths carry small
// amplitudes — verdant's finest octave is ~0.14 m). A cross-track ripple adds
// roll action. HARD GATE per frame after spring settle: the rigid root plane
// stays inside the visual suspension envelope and the sprung mass never uses
// more than its authored compression/droop travel.
// (8, 0.55) is fully climbable (~23° faces) and proves sustained cross-country
// driving; the steeper pairs stress the contact solve while the tank wallows
// in troughs bounded by faces beyond the fixture's available force margin.
for (const [wl, amp] of [[8, 1.5], [8, 0.55], [4, 0.5], [2, 0.12]]) {
  const k = (2 * Math.PI) / wl;
  const kx = (2 * Math.PI) / (wl * 1.3);
  // Spawn just past a crest (downhill start): faces beyond the fixture's
  // engine/grip capability stall correctly, so an uphill spawn would park it.
  const field = makeField((x, z) => amp * Math.sin(k * z) + 0.3 * amp * Math.sin(kx * x));
  const ent = makeEntity(field, 0, 0.55 * wl, 0);
  ent.input.throttle = 1;
  let worstPen = 0;
  let worstFloat = 0;
  let worstCompression = 0;
  let worstDroop = 0;
  let path = 0; // integrated |v| — capability-limited faces stall correctly,
  //              so wallowing/sliding counts as motion, displacement does not
  run(ent, field, 900, (i) => {
    path += Math.abs(ent.state.speed) * SIM_DT;
    if (i < 60) return; // spring settle from spawn
    const { penetration, minGap } = contactStats(ent.state, field);
    if (penetration > worstPen) worstPen = penetration;
    // In free flight, separation from the terrain is the intended ballistic
    // clearance rather than suspension travel. The authored envelope applies
    // only while the running gear has contact.
    if (ent.state.grounded) {
      if (minGap > worstFloat) worstFloat = minGap;
      const travel = ent.state._sup.y - ent.state.pos.y;
      if (travel > worstCompression) worstCompression = travel;
      if (-travel > worstDroop) worstDroop = -travel;
    }
  });
  assert(worstPen < 0.22,
    `sine drive λ=${wl} A=${amp}: root plane exceeds track up-travel (${worstPen.toFixed(3)} m)`);
  assert(worstFloat < 0.23,
    `sine drive λ=${wl} A=${amp}: root plane exceeds track droop (${worstFloat.toFixed(3)} m)`);
  assert(worstCompression <= 0.201,
    `sine drive λ=${wl} A=${amp}: compression travel ${worstCompression.toFixed(3)} m`);
  assert(worstDroop <= 0.181,
    `sine drive λ=${wl} A=${amp}: droop travel ${worstDroop.toFixed(3)} m`);
  assert(path > (amp / wl > 0.1 ? 3 : 40),
    `sine drive λ=${wl} A=${amp}: tank actually drove (path ${path.toFixed(1)} m)`);
}

// ------------------------------------------------- 5. diagonal rough drive --
// Combined pitch+roll action: drive at 40° across a two-axis egg-crate field.
{
  const field = makeField((x, z) =>
    1.0 * Math.sin((2 * Math.PI * z) / 7) * Math.cos((2 * Math.PI * x) / 9));
  const ent = makeEntity(field, -20, -20, 0.7);
  ent.input.throttle = 1;
  let worstPen = 0;
  let worstFloat = 0;
  let worstCompression = 0;
  let worstDroop = 0;
  run(ent, field, 900, (i) => {
    if (i < 60) return;
    const { penetration, minGap } = contactStats(ent.state, field);
    if (penetration > worstPen) worstPen = penetration;
    if (ent.state.grounded) {
      if (minGap > worstFloat) worstFloat = minGap;
      const travel = ent.state._sup.y - ent.state.pos.y;
      if (travel > worstCompression) worstCompression = travel;
      if (-travel > worstDroop) worstDroop = -travel;
    }
  });
  assert(worstPen < 0.22, `egg-crate drive: root plane exceeds up-travel (${worstPen.toFixed(3)} m)`);
  assert(worstFloat < 0.23, `egg-crate drive: root plane exceeds droop (${worstFloat.toFixed(3)} m)`);
  assert(worstCompression <= 0.201,
    `egg-crate drive: compression travel ${worstCompression.toFixed(3)} m`);
  assert(worstDroop <= 0.181,
    `egg-crate drive: droop travel ${worstDroop.toFixed(3)} m`);
}

// ------------------------------------------ 6. sprung heave on terrain step --
// A support-plane step is the most direct regression for the old "tracks
// taped to the ground" motion: pos.y used to consume the entire height change
// in one tick. The new sprung mass must initially absorb it in wheel/belt
// travel, then settle without exceeding either physical stop.
{
  let ground = 0;
  const field = makeField(() => ground);
  const ent = makeEntity(field);
  run(ent, field, 240);
  const before = ent.state.pos.y;
  ground = -0.16;
  ent.state._sup.x = NaN; // mutable fixture: force the static support cache to resample
  run(ent, field, 1);
  assert(before - ent.state.pos.y < 0.04,
    `16 cm hollow: chassis does not snap down in one tick (${(before - ent.state.pos.y).toFixed(3)} m)`);
  assert(ent.state.pos.y - ent.state._sup.y > 0.10,
    `16 cm hollow: track droop absorbs the first hit (${(ent.state.pos.y - ent.state._sup.y).toFixed(3)} m)`);
  let previousY = ent.state.pos.y;
  let reboundM = 0;
  run(ent, field, 300, () => {
    reboundM = Math.max(reboundM, ent.state.pos.y - previousY);
    previousY = ent.state.pos.y;
  });
  assert(reboundM < 0.003,
    `16 cm hollow: critically damped chassis rebound stays sub-3 mm (${reboundM.toFixed(4)} m)`);
  near(ent.state.pos.y, ent.state._sup.y, 0.01, '16 cm hollow: sprung mass settles onto support');
}
{
  let ground = 0;
  const field = makeField(() => ground);
  const ent = makeEntity(field);
  run(ent, field, 240);
  const before = ent.state.pos.y;
  ground = 0.14;
  ent.state._sup.x = NaN;
  run(ent, field, 1);
  assert(ent.state.pos.y - before < 0.04,
    `14 cm crest: chassis does not snap up in one tick (${(ent.state.pos.y - before).toFixed(3)} m)`);
  assert(ent.state._sup.y - ent.state.pos.y > 0.08,
    `14 cm crest: suspension compresses first (${(ent.state._sup.y - ent.state.pos.y).toFixed(3)} m)`);
  assert(ent.state.pos.y >= ent.state._sup.floorY - 1e-9,
    '14 cm crest: compression stop remains collision-safe');
  let previousY = ent.state.pos.y;
  let reboundM = 0;
  run(ent, field, 300, () => {
    reboundM = Math.max(reboundM, previousY - ent.state.pos.y);
    previousY = ent.state.pos.y;
  });
  assert(reboundM < 0.003,
    `14 cm crest: critically damped chassis rebound stays sub-3 mm (${reboundM.toFixed(4)} m)`);
  near(ent.state.pos.y, ent.state._sup.y, 0.01, '14 cm crest: sprung mass settles onto support');
}

// -------------------------------------------- 7. measured contact geometry --
// Measured visual contact metadata must seat the actual track floor, not the
// root origin, and a shorter sourced-model run must not perch on phantom
// support beyond its rendered track ends.
{
  const field = makeField(() => 2.0);
  const ent = makeEntity(field, 0, 0, 0);
  ent.contactGeom = {
    halfLenM: 2.0, halfWidM: 1.3, zCenterM: 0.15, bottomYM: 0.12,
  };
  run(ent, field, 180);
  const renderedFloor = ent.state.pos.y + ent.contactGeom.bottomYM;
  assert(renderedFloor >= 2.0 && renderedFloor < 2.04,
    `measured floor seats on terrain (${renderedFloor.toFixed(3)} m)`);
}
{
  const field = makeField((x, z) => (z > 2.45 && z < 2.95 ? 0.45 : 0));
  const ent = makeEntity(field, 0, 0, 0);
  ent.contactGeom = {
    halfLenM: 2.0, halfWidM: 1.3, zCenterM: 0, bottomYM: 0,
  };
  run(ent, field, 240);
  assert(ent.state.pos.y < 0.06,
    `measured short track ignores phantom end support (height ${ent.state.pos.y.toFixed(3)} m)`);
}

// ------------------------------------ 7a. ballistic crest/drop/landing -------
// Once the complete track run leaves a ledge, suspension droop is exhausted
// and the chassis becomes a projectile. Horizontal momentum must continue
// while vertical velocity integrates gravity; terrain support may not pull the
// root downward. A lower shelf then catches the fully extended tracks and the
// suspension absorbs the landing back to its neutral support height.
{
  const field = makeField((x, z) => (z < 0 ? 0 : -3));
  const ent = makeEntity(field, 0, -4.5, 0);
  run(ent, field, 180);
  ent.state.speed = 12;
  ent.input.throttle = 0;
  let tookOff = false;
  let landed = false;
  let takeoffZ = 0;
  let takeoffY = 0;
  let takeoffVY = 0;
  let afterThirdSecondVY = null;
  let airborneTicks = 0;
  let maxClearance = 0;
  run(ent, field, 360, () => {
    const ground = field.getHeightAt(ent.state.pos.x, ent.state.pos.z);
    maxClearance = Math.max(maxClearance, ent.state.pos.y - ground);
    if (!tookOff && ent.state.grounded === false) {
      tookOff = true;
      takeoffZ = ent.state.pos.z;
      takeoffY = ent.state.pos.y;
      takeoffVY = ent.state.verticalSpeed;
    }
    if (ent.state.grounded === false) {
      airborneTicks++;
      if (airborneTicks === 20) afterThirdSecondVY = ent.state.verticalSpeed;
    } else if (tookOff && airborneTicks > 0) {
      landed = true;
    }
  });
  assert(tookOff, 'ledge: tank leaves terrain support after suspension reaches full droop');
  assert(takeoffZ > -1,
    `ledge: support reaches the lip before takeoff (z=${takeoffZ.toFixed(2)})`);
  assert(maxClearance > 0.75,
    `ledge: chassis follows a free-flight arc instead of support (${maxClearance.toFixed(2)} m)`);
  assert(afterThirdSecondVY !== null &&
    Math.abs((afterThirdSecondVY - takeoffVY) + 9.81 * (20 / 60)) < 0.35,
  `ledge: airborne vertical acceleration is gravity (vy0=${takeoffVY}, vy.33=${afterThirdSecondVY})`);
  assert(ent.state.pos.z > takeoffZ + 2,
    `ledge: horizontal momentum continues in flight (${(ent.state.pos.z - takeoffZ).toFixed(2)} m)`);
  assert(landed && ent.state.grounded === true,
    'ledge: extended tracks re-establish support and remain grounded after landing');
  near(ent.state.pos.y, ent.state._sup.y, 0.03,
    'ledge: suspension settles from landing onto the lower shelf');
  assert(Number.isFinite(takeoffY), 'ledge: takeoff pose remains finite');
}

// A rising launch ramp preserves its upward support velocity at the instant
// contact disappears. The tank must continue above the lip before gravity
// bends the path down; snapping directly to the lower terrain is forbidden.
{
  const grade = 0.18;
  const field = makeField((x, z) => (z < 0 ? grade * z : -4));
  const ent = makeEntity(field, 0, -8, 0);
  run(ent, field, 180);
  ent.state.speed = 13;
  ent.input.throttle = 1;
  let takeoffY = null;
  let takeoffVY = null;
  let apexY = -Infinity;
  run(ent, field, 150, () => {
    if (ent.state.grounded === false) {
      if (takeoffY === null) {
        takeoffY = ent.state.pos.y;
        takeoffVY = ent.state.verticalSpeed;
      }
      apexY = Math.max(apexY, ent.state.pos.y);
    }
  });
  assert(takeoffY !== null, 'ramp: tank enters free flight at the lip');
  assert(takeoffVY > 0.5,
    `ramp: upward terrain velocity becomes launch velocity (${takeoffVY} m/s)`);
  assert(apexY > takeoffY + 0.08,
    `ramp: projectile rises beyond the lip before falling (${(apexY - takeoffY).toFixed(2)} m)`);
}

// A continuous rolling crest (no discontinuity) must also release contact
// when horizontal speed carries the chassis beyond what suspension droop can
// follow. This is the normal battlefield jump case.
{
  const grade = 0.22;
  const field = makeField((x, z) => (z < 0 ? grade * z : -grade * z));
  const ent = makeEntity(field, 0, -9, 0);
  run(ent, field, 180);
  ent.state.speed = 14;
  ent.input.throttle = 1;
  let airborneTicks = 0;
  let landed = false;
  run(ent, field, 240, () => {
    if (!ent.state.grounded) airborneTicks++;
    else if (airborneTicks > 0) landed = true;
  });
  assert(airborneTicks >= 6,
    `rolling crest: horizontal momentum produces a visible free-flight arc (${airborneTicks} ticks)`);
  assert(landed, 'rolling crest: tank naturally reconnects with the descending face');
}

// Free flight is a rigid-body phase, not a suspension target. Once the tracks
// lose support, angular momentum must carry continuously until a contact
// applies a torque. The former spring path critically damped pitch velocity in
// mid-air, then yanked a long jump toward the landing slope in one ugly lurch.
{
  const field = makeField(() => 0);
  const ent = makeEntity(field, 0, 0, 0);
  ent.state.pos.y = 100;
  ent.state.grounded = false;
  ent.state._ride.y = 100;
  ent.state._ride.v = 0;
  ent.state._ride.supportY = 0;
  ent.state._ride.grounded = false;
  ent.state._spring.pitchV = 0.55;
  const startPitch = ent.state.visualPitch;
  let previousPitch = startPitch;
  let maxStep = 0;
  run(ent, field, 180, () => {
    maxStep = Math.max(maxStep, Math.abs(ent.state.visualPitch - previousPitch));
    previousPitch = ent.state.visualPitch;
  });
  assert(ent.state.visualPitch > startPitch + 1.35,
    `three-second flight conserves launch rotation (${ent.state.visualPitch.toFixed(3)} rad)`);
  assert(maxStep < 0.02,
    `airborne attitude advances continuously without a pitch snap (${maxStep.toFixed(4)} rad/tick)`);
}

// A hard but still-upright landing receives bounded angular impulse and spring
// blending; closing speed alone must not lock the drivetrain into rollover.
// If the resulting rotation actually carries the center of mass past the
// threshold on later ticks, the normal rigid-body transition still owns it.
{
  const field = makeField(() => 0);
  const ent = makeEntity(field, 0, 0, 0);
  ent.state.visualPitch = 0.65;
  ent.state._spring.pitch = ent.state.visualPitch;
  ent.state.landingImpactMps = 12;
  updateTank(ent, field, SIM_DT);
  assert(ent.state._body.tumbling === false,
    'upright hard landing does not enter tumble from an angle-speed heuristic');
}

// A tank that crosses its rollover point must not be auto-uprighted by the
// ordinary terrain-conformance spring. It should settle on the roof/side until
// another physical impulse rolls it back.
{
  const field = makeField(() => 0);
  const ent = makeEntity(field, 0, 0, 0);
  ent.state.visualRoll = Math.PI - 0.08;
  ent.state._spring.roll = ent.state.visualRoll;
  ent.state._spring.rollV = 0;
  run(ent, field, 90);
  assert(ent.state.overturned === true, 'rollover: upside-down state is explicit');
  assert(Math.cos(ent.state.visualPitch) * Math.cos(ent.state.visualRoll) < -0.65,
    `rollover: hull remains roof-down instead of auto-uprighting (${ent.state.visualRoll.toFixed(2)} rad)`);
  near(ent.state.pos.y, 2.158, 0.025,
    'rollover: exact turret roof contact seats the inverted visual on flat ground');
  assert(ent.state.pos.y < SPEC.dims.heightM - 0.45,
    `rollover: non-structural published height cannot prop up the tank (${ent.state.pos.y.toFixed(3)} m)`);
}

// Assisted recovery is intentionally separate from ordinary suspension. Once
// its stationary timer fires, the same bounded angular state visibly rolls the
// hull upright; it never teleports the rendered pose.
{
  const field = makeField(() => 0);
  const ent = makeEntity(field, 0, 0, 0);
  ent.state.visualRoll = Math.PI - 0.02;
  ent.state._spring.roll = ent.state.visualRoll;
  ent.state._body.tumbling = true;
  ent.state.overturned = true;
  assert(requestTankSelfRight(ent.state), 'self-right input accepts a grounded overturned hull');
  assert(ent.state.verticalSpeed > 0, 'self-right input launches the hull instead of teleporting it');
  run(ent, field, 300);
  const upY = Math.cos(ent.state.visualPitch) * Math.cos(ent.state.visualRoll);
  assert(upY > 0.9, `auto-right actuator rolls through the contact edge (${upY.toFixed(3)} up)`);
  assert(ent.state._body.autoRighting === false && ent.state._body.tumbling === false,
    'auto-right actuator releases back to ordinary terrain support');
}

// Owner 2026-09-16 (Turbo Ball): the F key adds an upward vector to a grounded upright hull; airborne and
// overturned hulls refuse it, and modes without a jump refuse it, so F keeps its self-right meaning elsewhere.
{
  const field = makeField(() => 0);
  const ent = makeEntity(field, 0, 0, 0);
  run(ent, field, 30);
  assert(!requestTankJump(ent.state, null), 'no jump without a ruleset launch');
  assert(requestTankJump(ent.state, 9), 'a grounded upright hull jumps');
  assert(ent.state.verticalSpeed >= 9 && ent.state._ride.v >= 9, 'the jump is a vertical velocity, not a teleport');
  const startY = ent.state.pos.y;
  run(ent, field, 20);
  assert(ent.state.pos.y > startY + 0.5, `the hull leaves the ground (${(ent.state.pos.y - startY).toFixed(2)} m up)`);
  assert(!requestTankJump(ent.state, 9), 'no second boost inside the first 0.35 s of flight');
  run(ent, field, 20);
  const beforeBoost = ent.state.verticalSpeed;
  assert(requestTankJump(ent.state, 9), 'round 30: an airborne hull boosts again after 0.35 s of flight');
  assert(ent.state.verticalSpeed > beforeBoost + 8, 'the boost adds its full launch on top of the flight');
  run(ent, field, 600);
  assert(Math.abs(ent.state.pos.y - startY) < 0.3, 'it lands back on the field');
  const flipped = makeEntity(field, 0, 0, 0);
  flipped.state.overturned = true;
  assert(!requestTankJump(flipped.state, 9), 'an overturned hull cannot jump; F self-rights it instead');
}

// Ruleset recoil launch (Turbo Ball: "aim behind you and launch yourself and use it as a speed boost"): firing
// over the rear adds run speed, firing forward brakes, firing downward lifts the ride; scale 1 keeps the old kick.
{
  const field = makeField(() => 0);
  const ent = makeEntity(field, 0, 0, 0);
  run(ent, field, 30);
  const before = ent.state.speed;
  ent.state.turretYaw = Math.PI;
  fireRecoil(ent.state, SPEC, null, { scale: 12, dirX: 0, dirY: 0, dirZ: -1 });
  assert(ent.state.speed > before + 1.5, `firing over the rear boosts the run speed (${(ent.state.speed - before).toFixed(2)} m/s)`);
  const braked = makeEntity(field, 0, 0, 0);
  run(braked, field, 30);
  braked.state.speed = 8;
  fireRecoil(braked.state, SPEC, null, { scale: 12, dirX: 0, dirY: 0, dirZ: 1 });
  assert(braked.state.speed < 8, 'firing forward pushes the hull back');
  const hop = makeEntity(field, 0, 0, 0);
  run(hop, field, 30);
  fireRecoil(hop.state, SPEC, null, { scale: 12, dirX: 0, dirY: -0.7, dirZ: 0.714 });
  assert(hop.state.verticalSpeed > 0.5, 'firing downward hops the hull');
  const plain = makeEntity(field, 0, 0, 0);
  run(plain, field, 30);
  const plainSpeed = plain.state.speed;
  fireRecoil(plain.state, SPEC, null, { scale: 1, dirX: 0, dirY: 0, dirZ: -1 });
  assert(plain.state.speed === plainSpeed && !(plain.state.verticalSpeed > 0), 'scale 1 keeps the ordinary hull kick only');
}

// Impact knock (whole game): a shell shoves the hull it hits along its flight direction; the magnitude follows
// calibre squared, shell speed and the victim's mass, bounded; the ruleset scale multiplies it.
{
  const light = shellKnockMps(105, 900, 45, 1), heavy = shellKnockMps(152, 900, 45, 1), fast = shellKnockMps(105, 1600, 45, 1);
  assert(Math.abs(light - 1.3) < 1e-9, `105 mm at 900 m/s on 45 t shoves 1.3 m/s (${light})`);
  assert(heavy > light * 1.9 && fast > light, 'heavier and faster shells shove more');
  assert(shellKnockMps(105, 900, 20, 1) > light && shellKnockMps(105, 900, 70, 1) < light, 'lighter hulls are shoved further');
  assert(shellKnockMps(152, 1600, 10, 4) === 9, 'the shove is bounded');
  assert(Math.abs(shellKnockMps(105, 900, 45, 2.5) - 3.25) < 1e-9, 'the ruleset scale multiplies the shove');
  const field = makeField(() => 0);
  const ent = makeEntity(field, 0, 0, 0);
  run(ent, field, 30);
  const speed0 = ent.state.speed;
  applyShellKnock(ent.state, 0, 0, 1, 1.3);
  assert(ent.state._spring.recoilVZ > 2.0 && ent.state.speed === speed0, 'a shell from behind shoves the hull forward without becoming a drive input');
  const side = makeEntity(field, 0, 0, 0);
  run(side, field, 30);
  applyShellKnock(side.state, 1, 0, 0, 1.3);
  assert(Math.abs(side.state._spring.recoilVX) > 2.0 && Math.abs(side.state.speed) < 0.2, 'a shell from the side shoves the hull sideways');
  assert(Math.abs(side.state._spring.rollV) > 0.05, 'and rocks it');
  const big = makeEntity(field, 0, 0, 0);
  run(big, field, 30);
  applyShellKnock(big.state, 0, 0.2, 1, 4);
  assert(big.state.verticalSpeed > 0.3, 'a heavy shove lifts the ride');
}

// Airborne ticks skip loaded-track material and four-corner suspension-rock
// probes. Landing support still uses the conservative footprint pass, so this
// is a strict hot-loop saving rather than a lower-fidelity collision mode.
{
  function countedField() {
    const counts = { height: 0, ground: 0 };
    return {
      counts,
      getHeightAt() { counts.height++; return 0; },
      getGroundType() { counts.ground++; return 'medium'; },
      getNormalAt: () => null,
    };
  }
  const groundField = countedField();
  const grounded = makeEntity(groundField, 0, 0, 0);
  groundField.counts.height = 0;
  grounded.state.speed = 4;
  updateTank(grounded, groundField, SIM_DT);
  const groundedHeightQueries = groundField.counts.height;

  const airField = countedField();
  const airborne = makeEntity(airField, 0, 0, 0);
  airborne.state.pos.y = 10;
  airborne.state.grounded = false;
  airborne.state._ride.y = 10;
  airborne.state._ride.v = 0;
  airborne.state._ride.supportY = 0;
  airborne.state._ride.grounded = false;
  airField.counts.height = 0;
  airField.counts.ground = 0;
  airborne.state.speed = 4;
  updateTank(airborne, airField, SIM_DT);
  assert(airField.counts.ground === 0,
    'airborne hot loop: skips unloaded-track ground-material lookup');
  assert(airField.counts.height <= groundedHeightQueries - 4,
    `airborne hot loop: removes suspension-rock probes (${airField.counts.height} vs ${groundedHeightQueries})`);
}

// ---------------------------------- 7b. capability-based slope constraint ---
// Transmission target speed alone is not a contact constraint: a fast tank
// used to carry momentum straight up a 45-degree face while the support solve
// lifted it. When track grip cannot hold a face it must reject uphill
// displacement and gravity must return the hull downslope. Ordinary 20-degree
// grades remain driveable for this fixture.
{
  const steep = makeField((x, z) => z);
  const ent = makeEntity(steep, 0, 0, 0);
  run(ent, steep, 300);
  const startZ = ent.state.pos.z;
  ent.state.speed = 10;
  ent.input.throttle = 1;
  let reportedBlock = false;
  run(ent, steep, 60, () => { reportedBlock ||= ent.state.slopeBlocked; });
  assert(ent.state.pos.z < startZ + 0.35,
    `45-degree grade: uphill displacement is rejected (${(ent.state.pos.z - startZ).toFixed(2)} m)`);
  assert(ent.state.speed <= 0,
    `45-degree grade: tank stalls or slides downslope (${ent.state.speed.toFixed(2)} m/s)`);
  assert(reportedBlock, '45-degree grade: solver reports rejected traction to bot recovery');
}
{
  const field = makeField((x, z) => (z < 0 ? 0 : z));
  const ent = makeEntity(field, 0, -8, 0);
  run(ent, field, 240);
  ent.state.speed = 12;
  ent.input.throttle = 1;
  let farthestZ = ent.state.pos.z;
  run(ent, field, 240, () => { farthestZ = Math.max(farthestZ, ent.state.pos.z); });
  assert(farthestZ < 1.5,
    `45-degree face approach: high-speed entry remains bounded (max z=${farthestZ.toFixed(2)})`);
  assert(ent.state.speed <= 0.05,
    `45-degree face approach: no sustained uphill velocity (${ent.state.speed.toFixed(2)} m/s)`);
}
{
  const grade = Math.tan(20 * Math.PI / 180);
  const field = makeField((x, z) => grade * z);
  const ent = makeEntity(field, 0, 0, 0);
  ent.input.throttle = 1;
  run(ent, field, 600);
  assert(ent.state.pos.z > 3,
    `20-degree grade: normal climb remains driveable (${ent.state.pos.z.toFixed(2)} m)`);
  assert(ent.state.grounded === true, '20-degree grade: normal climb retains terrain contact');
}

// A grade is not globally climbable or blocked. The available engine force
// determines sustained uphill drive, while the track/ground grip bounds the
// contact force. All three fixtures face the exact same 32-degree slope.
{
  const grade = Math.tan(32 * Math.PI / 180);
  const field = makeField((x, z) => grade * z);
  const mobileBase = {
    ...SPEC,
    weightTons: 40,
    terrainResistance: { hard: 0.75, medium: 0.9, soft: 1.6 },
  };
  const strong = makeEntity(field, 0, 0, 0, {
    ...mobileBase,
    name: 'strong-high-grip',
    enginePowerHp: 900,
    trackTraction: 1.15,
  });
  const weakEngine = makeEntity(field, 0, 0, 0, {
    ...mobileBase,
    name: 'weak-engine',
    enginePowerHp: 240,
    trackTraction: 1.15,
  });
  const lowGrip = makeEntity(field, 0, 0, 0, {
    ...mobileBase,
    name: 'strong-low-grip',
    enginePowerHp: 900,
    trackTraction: 0.48,
  });
  const damagedEngine = makeEntity(field, 0, 0, 0, {
    ...mobileBase,
    name: 'damaged-engine',
    enginePowerHp: 650,
    trackTraction: 1.15,
  });
  damagedEngine.combat = { modules: { engine: { state: 'yellow' } } };
  for (const entity of [strong, weakEngine, lowGrip, damagedEngine]) {
    entity.input.throttle = 1;
  }
  let weakReportedBlock = false;
  let gripReportedBlock = false;
  let damageReportedBlock = false;
  run(strong, field, 600);
  run(weakEngine, field, 600, () => { weakReportedBlock ||= weakEngine.state.slopeBlocked; });
  run(lowGrip, field, 600, () => { gripReportedBlock ||= lowGrip.state.slopeBlocked; });
  run(damagedEngine, field, 600, () => {
    damageReportedBlock ||= damagedEngine.state.slopeBlocked;
  });
  assert(strong.state.pos.z > 3,
    `32-degree capability: strong high-grip tank climbs (${strong.state.pos.z.toFixed(2)} m)`);
  assert(weakEngine.state.pos.z < 1,
    `32-degree capability: weak engine cannot sustain climb (${weakEngine.state.pos.z.toFixed(2)} m)`);
  assert(lowGrip.state.pos.z < 1,
    `32-degree capability: low-grip tracks cannot hold climb (${lowGrip.state.pos.z.toFixed(2)} m)`);
  assert(damagedEngine.state.pos.z < 1,
    `32-degree capability: damaged engine loses rated climb (${damagedEngine.state.pos.z.toFixed(2)} m)`);
  assert(weakReportedBlock, '32-degree capability: engine-limited climb informs bot recovery');
  assert(gripReportedBlock, '32-degree capability: traction-limited climb informs bot recovery');
  assert(damageReportedBlock, '32-degree capability: module-damaged climb informs bot recovery');
}

// ------------------------------------------------------ 7. accel sanity --
{
  const field = makeField(() => 0);
  const ent = makeEntity(field, 0, 0, 0);
  ent.input.throttle = 1;
  run(ent, field, 600);
  const top = SPEC.topSpeedKmh / 3.6;
  assert(ent.state.speed > 0.8 * top,
    `flat accel: ${(ent.state.speed * 3.6).toFixed(1)} km/h after 10 s (need >80% of top)`);
}

// ------------------------------------------- 8. service-brake softness --
// Forward and reverse braking must settle promptly but never erase a
// full-speed forward tank in about one second or kick an oversized pitch.
{
  const field = makeField(() => 0);
  const ent = makeEntity(field, 0, 0, 0);
  ent.input.throttle = 1;
  run(ent, field, 600);
  const start = ent.state.speed;
  ent.input.throttle = 0;
  ent.input.brake = true;
  let peakPitch = 0;
  run(ent, field, 60, () => { peakPitch = Math.max(peakPitch, Math.abs(ent.state.visualPitch)); });
  assert(ent.state.speed > start * 0.30,
    `forward brake: one-second speed ${ent.state.speed.toFixed(2)} preserves momentum from ${start.toFixed(2)}`);
  assert(peakPitch < 0.075, `forward brake: pitch lurch ${peakPitch.toFixed(3)} rad`);
  run(ent, field, 180);
  assert(Math.abs(ent.state.speed) < 0.05, 'forward brake: settles within four seconds');

  const rev = makeEntity(field, 0, 0, 0);
  rev.input.throttle = -1;
  run(rev, field, 300);
  rev.input.throttle = 0;
  rev.input.brake = true;
  peakPitch = 0;
  run(rev, field, 90, () => { peakPitch = Math.max(peakPitch, Math.abs(rev.state.visualPitch)); });
  assert(Math.abs(rev.state.speed) < 0.05, 'reverse brake: settles cleanly');
  assert(peakPitch < 0.075, `reverse brake: pitch lurch ${peakPitch.toFixed(3)} rad`);
}

// ------------------------------------------- 9. gun-terrain muzzle clamp --
// Aim at the foot of a steep rising wall: the level barrel line would sink the
// muzzle ~0.8 m into the slope. The clamp must hold the muzzle above ground
// and flag atGunLimit so the reticle pins.
{
  const field = makeField((x, z) => Math.max(0, (z - 2) * 1.2));
  const ent = makeEntity(field, 0, 0, 0);
  ent.input.aimPoint = new Vector3(0, field.getHeightAt(0, 3.5) + 0.02, 3.5);
  run(ent, field, 300);
  const st = ent.state;
  const barrel = SPEC.armor.gunBarrel.lengthM;
  const pose = gunPoseWorld(st);
  const muzzle = pose.origin.clone().addScaledVector(pose.direction, barrel);
  const ground = field.getHeightAt(muzzle.x, muzzle.z);
  assert(muzzle.y > ground + 0.1,
    `muzzle clamp: muzzle ${muzzle.y.toFixed(2)} m vs ground ${ground.toFixed(2)} m (+0.1 min)`);
  assert(st.atGunLimit === true, 'muzzle clamp: atGunLimit flags the pinned gun');
}

// ----------------------------------------- 9b. exact gun lay on a sidehill --
// A combined pitch/roll hull pose must not use a small-angle approximation:
// once traverse has settled, the articulated bore itself follows the requested
// world ray. Firing code is forbidden from hiding residual error by steering a
// shell away from the visible barrel.
{
  const field = makeField((x, z) => 0.25 * x + 0.2 * z);
  const ent = makeEntity(field, 0, 0, 0.7);
  ent.input.aimPoint = new Vector3(-220, 12, 120);
  run(ent, field, 600);
  const pose = gunPoseWorld(ent.state);
  const wanted = ent.input.aimPoint.clone().sub(pose.origin).normalize();
  const error = pose.direction.angleTo(wanted);
  assert(!ent.state.atGunLimit, 'sidehill gun lay: requested point is inside the gun arc');
  assert(error < 0.001,
    `sidehill gun lay: settled bore follows world ray (error ${(error * 180 / Math.PI).toFixed(3)} deg)`);
}

// --------------------------------------- 9c. traverse and vertical stops --
// The requested ray is exact only when mechanically reachable. Turret slew
// rate and the per-vehicle elevation/depression stops remain authoritative.
{
  const field = makeField(() => 0);
  const traverse = makeEntity(field, 0, 0, 0);
  traverse.input.aimPoint = new Vector3(300, 2, 0);
  updateTank(traverse, field, SIM_DT);
  const maxTurretStep = SPEC.turretTraverseDegS * Math.PI / 180 * SIM_DT;
  assert(Math.abs(traverse.state.turretYaw) <= maxTurretStep + 1e-9,
    'turret lay: one tick cannot exceed the vehicle traverse rate');
  run(traverse, field, 300);
  near(traverse.state.turretYaw, Math.PI / 2, 0.001,
    'turret lay: reachable horizontal ray converges exactly');

  const elevated = makeEntity(field, 0, 0, 0);
  elevated.input.aimPoint = new Vector3(0, 300, 200);
  run(elevated, field, 300);
  near(elevated.state.gunPitch, SPEC.gunElevationDeg * Math.PI / 180, 1e-9,
    'gun lay: elevation is clamped to the vehicle specification');
  assert(elevated.state.atGunLimit, 'gun lay: elevation stop reports a pinned reticle');

  const depressed = makeEntity(field, 0, 0, 0);
  depressed.input.aimPoint = new Vector3(0, -100, 300);
  run(depressed, field, 300);
  near(depressed.state.gunPitch, -SPEC.gunDepressionDeg * Math.PI / 180, 1e-9,
    'gun lay: depression is clamped to the vehicle specification');
  assert(depressed.state.atGunLimit, 'gun lay: depression stop reports a pinned reticle');
}

// --------------------------------------- 9d. sight-independent gun hold --
// Caps/RB/RMB gun hold is not a frozen world target. The camera may publish a
// new sight ray every frame while the articulated turret and gun retain their
// exact current lay; release then lets both axes catch up normally.
{
  const field = makeField(() => 0);
  const ent = makeEntity(field, 0, 0, 0);
  ent.input.aimPoint = new Vector3(180, 35, 260);
  run(ent, field, 300);
  const heldYaw = ent.state.turretYaw;
  const heldPitch = ent.state.gunPitch;

  ent.input.aimLocked = true;
  ent.input.aimPoint.set(-260, -12, 180);
  run(ent, field, 120);
  near(ent.state.turretYaw, heldYaw, 1e-12,
    'gun hold: live sight movement preserves turret rotation exactly');
  near(ent.state.gunPitch, heldPitch, 1e-12,
    'gun hold: live sight movement preserves gun elevation exactly');

  ent.input.aimLocked = false;
  run(ent, field, 180);
  assert(Math.abs(ent.state.turretYaw - heldYaw) > 0.25,
    'gun hold: release lets turret rotation catch up to the current sight');
  assert(Math.abs(ent.state.gunPitch - heldPitch) > 0.02,
    'gun hold: release lets gun elevation catch up to the current sight');
}

// -------------------------------------- 10. IFV autocannon burst grouping --
// Ten rounds at the roster's fastest 0.35 s cadence must remain close to the fully aimed cone.
// The alternate missile rail and non-IFV guns retain normal cannon bloom.
{
  const field = makeField(() => 0);
  const rapidIfv = {
    ...SPEC,
    role: 'ifv',
    gun: {
      ...SPEC.gun,
      caliberMm: 30,
      reloadS: 0.35,
      aimTimeS: 1.4,
      bloom: { ...SPEC.gun.bloom, afterShot: 2.2 },
    },
  };
  const ent = {
    spec: rapidIfv,
    state: createTankState(rapidIfv, new Vector3(), 0),
    input: { throttle: 0, steer: 0, brake: false, aimPoint: null },
    combat: null,
  };
  const beltRound = { caliberMm: 30, reloadS: 0.35 };
  let peakBloom = 1;
  for (let shot = 0; shot < 10; shot++) {
    fireRecoil(ent.state, rapidIfv, beltRound);
    peakBloom = Math.max(peakBloom, ent.state.bloomF);
    run(ent, field, Math.round(0.35 / SIM_DT));
  }
  assert(peakBloom < 1.06,
    `IFV autocannon: ten-round peak bloom ${peakBloom.toFixed(3)} stays near fully aimed`);
  near(IFV_AUTOCANNON_AFTER_SHOT_BLOOM, 1.02, 1e-9,
    'IFV autocannon: per-round bloom nudge is two percent');

  const rapidKickState = createTankState(rapidIfv, new Vector3(), 0);
  fireRecoil(rapidKickState, rapidIfv, beltRound);
  near(shotRecoilScale(rapidIfv, beltRound), IFV_AUTOCANNON_RECOIL_SCALE, 1e-9,
    'IFV autocannon: shared recoil scale selected');
  near(rapidKickState._spring.pitchV, 8 * Math.PI / 180 * IFV_AUTOCANNON_RECOIL_SCALE, 1e-9,
    'IFV autocannon: hull pitch impulse uses the readable 36-percent scale');
  near(Math.hypot(rapidKickState._spring.recoilVX, rapidKickState._spring.recoilVZ),
    0.3 * 0.7 * IFV_AUTOCANNON_RECOIL_SCALE, 1e-9,
    'IFV autocannon: translation impulse uses the readable 36-percent scale');

  ent.state.bloomF = 1;
  fireRecoil(ent.state, rapidIfv, { caliberMm: 152, reloadS: 14 });
  near(ent.state.bloomF, 2.2, 1e-9, 'IFV missile rail keeps full after-shot bloom');
  near(shotRecoilScale(rapidIfv, { caliberMm: 152, reloadS: 14 }), 1, 1e-9,
    'IFV missile rail keeps full physical/presentation recoil');

  const mbt = { ...rapidIfv, role: 'mbt' };
  const mbtState = createTankState(mbt, new Vector3(), 0);
  fireRecoil(mbtState, mbt, beltRound);
  near(mbtState.bloomF, 2.2, 1e-9, 'rapid non-IFV gun keeps normal after-shot bloom');
  near(shotRecoilScale(mbt, beltRound), 1, 1e-9,
    'rapid non-IFV gun keeps full physical/presentation recoil');
}

// ---------------------------------------- 11. integration contract edges --
// These are low-frequency paths, but they are authoritative contracts: damage
// modifiers must compose, teleports must reseed contact, and sourced running
// gear metadata must participate in support without changing the hot path.
{
  let malformedRejected = false;
  try {
    createTankState({}, new Vector3(), 0);
  } catch (error) {
    malformedRejected = error instanceof Error && error.message.includes('malformed TankSpec');
  }
  assert(malformedRejected, 'state factory rejects an incomplete movement specification');

  const fallbackSpec = {
    ...SPEC,
    armor: { boundingRadiusM: 3.8 },
  };
  const fallbackState = createTankState(fallbackSpec, new Vector3(2, 3, 4), 0);
  near(fallbackState.aimPoint.y, 3 + fallbackSpec.dims.heightM * 0.85, 1e-12,
    'state factory uses the documented fallback trunnion height');

  fallbackState._ride.y = 99;
  fallbackState._ride.v = 7;
  fallbackState._ride.supportY = 5;
  fallbackState._sup.x = 8;
  fallbackState._body.tumbling = true;
  resetTankVerticalState(fallbackState, 6.5, -2, true);
  near(fallbackState.pos.y, 6.5, 1e-12, 'vertical reset writes the authored height');
  near(fallbackState.verticalSpeed, -2, 1e-12, 'vertical reset preserves a finite launch velocity');
  assert(Number.isNaN(fallbackState._ride.supportY) && Number.isNaN(fallbackState._sup.x),
    'vertical reset invalidates both support caches');
  assert(fallbackState._body.tumbling === false,
    'grounded vertical reset releases ordinary tumble state');
  resetTankVerticalState(fallbackState, 7, Number.NaN, false);
  assert(fallbackState.verticalSpeed === 0 && fallbackState.grounded === false,
    'airborne vertical reset sanitizes velocity and preserves flight phase');

  let invalidResetRejected = false;
  try {
    resetTankVerticalState(null, 0);
  } catch (error) {
    invalidResetRejected = error instanceof TypeError;
  }
  assert(invalidResetRejected, 'vertical reset rejects a missing state');
}

{
  const field = makeField(() => 0);
  const damaged = makeEntity(field);
  damaged.input.throttle = 1;
  damaged.input.steer = 1;
  damaged.input.aimPoint = new Vector3(100, 2, 0);
  damaged.combat = {
    modules: {
      transmission: { state: 'red' },
      turretRing: { state: 'red' },
      gun: { state: 'yellow' },
    },
    crew: { driver: false, gunner: false },
    equipMults: { traverse: 1.05, turret: 1.08, aimTime: 0.9, bloom: 0.8 },
  };
  run(damaged, field, 30);
  assert(damaged.state.speed > 0 && damaged.state.speed < 0.3,
    'red transmission and dead driver compose into reduced, nonzero mobility');
  assert(damaged.state.bloomF >= 2,
    'yellow gun enforces the authoritative damaged-dispersion floor');

  const yellowTransmission = makeEntity(field);
  yellowTransmission.input.throttle = 1;
  yellowTransmission.combat = {
    modules: {
      transmission: { state: 'yellow' },
      turretRing: { state: 'yellow' },
    },
  };
  run(yellowTransmission, field, 30);
  assert(yellowTransmission.state.speed > damaged.state.speed,
    'yellow transmission retains more drive authority than red transmission');

  const damagedMount = makeEntity(field);
  damagedMount.combat = { modules: { gunMount: { state: 'yellow' } } };
  run(damagedMount, field, 30);
  assert(damagedMount.state.bloomF >= 2,
    'yellow casemate gun mount enforces the damaged-dispersion floor');

  const tracked = makeEntity(field);
  tracked.input.throttle = 1;
  tracked.combat = { modules: { trackL: { state: 'red' } } };
  run(tracked, field, 60);
  near(tracked.state.speed, 0, 1e-12, 'destroyed track immobilizes the vehicle');
}

{
  const field = makeField(() => 0);
  const casemateSpec = {
    ...SPEC,
    gunArcDeg: 4,
    armor: { ...SPEC.armor, turretless: true },
  };
  const casemate = makeEntity(field, 0, 0, 0, casemateSpec);
  casemate.input.aimPoint = new Vector3(100, 2, 0);
  run(casemate, field, 90);
  assert(casemate.state.yaw > 0.1,
    'casemate auto-traverse turns the hull toward a sight outside the gun arc');
  assert(Math.abs(casemate.state.pos.x) + Math.abs(casemate.state.pos.z) > 0.001,
    'pivot-style casemate traverse applies the authored track offset');

  const hydraulicSpec = {
    ...SPEC,
    hydropneumaticAim: { noseDownDeg: 6, noseUpDeg: 8, rateDegS: 5 },
  };
  const hydraulic = makeEntity(field, 0, 0, 0, hydraulicSpec);
  hydraulic.state.suspensionAim = true;
  hydraulic.input.aimPoint = new Vector3(0, 40, 100);
  run(hydraulic, field, 60);
  assert(hydraulic.state.suspensionAimPitch > 0.03,
    'conventional turret uses suspension aim to extend its vertical envelope');
  const heldSuspensionPitch = hydraulic.state.suspensionAimPitch;
  hydraulic.input.aimLocked = true;
  hydraulic.input.aimPoint.set(0, -40, 100);
  run(hydraulic, field, 30);
  near(hydraulic.state.suspensionAimPitch, heldSuspensionPitch, 1e-12,
    'sight-independent gun hold also preserves the hydraulic suspension lay');

  const wrapped = makeEntity(field);
  wrapped.contactGeom = {
    halfLenM: 2.2,
    halfWidM: 1.3,
    zCenterM: 0,
    bottomYM: 0,
    gearBottomYM: 0,
    endRise: { dzM: 0.3, frontM: 0.22, rearM: 0.18 },
  };
  run(wrapped, field, 60);
  assert(Number.isFinite(wrapped.state.pos.y),
    'track-wrap support metadata resolves to a finite chassis pose');

  const fallbackBodySpec = {
    ...SPEC,
    armor: { ...SPEC.armor, bodyContactPoints: undefined },
  };
  const fallbackBody = makeEntity(field, 0, 0, 0, fallbackBodySpec);
  fallbackBody.state.visualRoll = Math.PI - 0.05;
  fallbackBody.state._spring.roll = fallbackBody.state.visualRoll;
  run(fallbackBody, field, 2);
  assert(Number.isFinite(fallbackBody.state.pos.y) && fallbackBody.state.overturned,
    'fallback closed-shell support seats an overturned tank without anatomy points');

  const flinching = makeEntity(field);
  flinching.state._flinch = { p: 0.04, r: -0.03, pv: 0.1, rv: -0.1 };
  const before = Math.abs(flinching.state._flinch.p) + Math.abs(flinching.state._flinch.r);
  run(flinching, field, 180);
  const after = Math.abs(flinching.state._flinch.p) + Math.abs(flinching.state._flinch.r);
  assert(after < before * 0.01, 'impact flinch decays through the bounded attitude spring');
}

// ---------------------------------------------------------------- summary --
if (failures > 0) {
  console.error(`movement.selftest: ${failures}/${checks} checks FAILED`);
  process.exit(1);
}
// Wrecks (2026-09-19, owner: "when a tank gets destroyed, it should continue being affected by physics"): a
// destroyed hull skids to rest on its locked tracks and keeps its ballistic momentum in the air.
{
  const flat = makeField(() => 0);
  const wreck = makeEntity(flat, 0, 0, 0);
  wreck.combat = { destroyed: true };
  wreck.state.speed = 12;
  wreck.input.throttle = 1;
  const startZ = wreck.state.pos.z;
  run(wreck, flat, 30);
  assert(wreck.state.speed > 6 && wreck.state.speed < 11.5,
    `a fresh wreck is still sliding after half a second (${wreck.state.speed.toFixed(2)} m/s)`);
  run(wreck, flat, 210);
  assert(Math.abs(wreck.state.speed) < 0.05, `the wreck comes to rest within four seconds (${wreck.state.speed.toFixed(3)})`);
  const slid = wreck.state.pos.z - startZ;
  assert(slid > 10 && slid < 20, `the skid covers a real distance (${slid.toFixed(1)} m)`);
  assert(wreck.state.yawRate === 0, 'no drive means no traverse');
  checks += 4;

  const drop = makeField(() => 0);
  const flier = makeEntity(drop, 0, 0, 0);
  flier.combat = { destroyed: true };
  flier.state.pos.y = 12;
  flier.state.grounded = false;
  flier.state._ride.grounded = false;
  flier.state._ride.y = 12;
  flier.state.speed = 9;
  const y0 = flier.state.pos.y;
  run(flier, drop, 20);
  assert(Math.abs(flier.state.speed - 9) < 1e-6, `an airborne wreck keeps its horizontal speed (${flier.state.speed})`);
  assert(flier.state.pos.y < y0 - 0.4 && flier.state.verticalSpeed < 0, 'and keeps falling along its arc');
  checks += 2;
}


// ---------------------------------------------------------- cliff wall (round 30) --
// Owner 2026-09-20: hulls "going up walls, or sides of steep hills at high speeds". Ground rising steeper than
// CLIFF_GRADE right ahead of the tracks is a wall: the hull stops against it with an impact instead of riding the
// support solve up the face and launching off the top. A climbable ramp is untouched, and an airborne hull already
// above the rise is not blocked.
{
  const cliffField = makeField((x, z) => (z < 20 ? 0 : (z - 20) * 1.8)); // a 61-degree face at z = 20
  const charger = makeEntity(cliffField, 0, 0, 0);
  charger.input.throttle = 1;
  let peakSpeed = 0, peakImpact = 0, peakY = 0;
  run(charger, cliffField, 360, () => {
    peakSpeed = Math.max(peakSpeed, charger.state.speed);
    peakImpact = Math.max(peakImpact, charger.state.impactMps);
    peakY = Math.max(peakY, charger.state.pos.y);
  });
  assert(peakSpeed > 3, `the charger reached the face at speed (${peakSpeed.toFixed(2)} m/s)`);
  assert(charger.state.pos.z < 20.6, `and stopped at its foot instead of climbing it (z ${charger.state.pos.z.toFixed(2)})`);
  assert(peakY < 1.6, `without riding up the face (peak y ${peakY.toFixed(2)})`);
  assert(peakImpact > 1, `the stop registered as an impact (${peakImpact.toFixed(2)} m/s)`);
  assert(Math.abs(charger.state.speed) < 0.6, `and the hull is held against the wall (${charger.state.speed.toFixed(2)} m/s)`);

  const rampField = makeField((x, z) => (z < 20 ? 0 : (z - 20) * 0.27)); // a 15-degree ramp
  const climber = makeEntity(rampField, 0, 0, 0);
  climber.input.throttle = 1;
  run(climber, rampField, 360);
  assert(climber.state.pos.z > 22, `a climbable ramp is still climbed (z ${climber.state.pos.z.toFixed(2)})`);

  const probe = makeEntity(cliffField, 0, 18.8, 0);
  probe.state.speed = 6;
  assert(cliffAhead(cliffField, probe.state, 3.5, 0, 1) === true, 'cliffAhead: the face ahead of the leading edge is a wall');
  probe.state.speed = -6;
  assert(cliffAhead(cliffField, probe.state, 3.5, 0, 1) === false, 'cliffAhead: reversing away from it is not');
  probe.state.speed = 6; probe.state.pos.y = 12;
  assert(cliffAhead(cliffField, probe.state, 3.5, 0, 1) === false, 'cliffAhead: a hull flying above the rise passes');
  const flat = makeEntity(makeField(() => 0), 0, 0, 0);
  flat.state.speed = 6;
  assert(cliffAhead(flat.spec ? makeField(() => 0) : null, flat.state, 3.5, 0, 1) === false, 'cliffAhead: flat ground never blocks');
  // a 2 m trench wall is a step, not a wall: the face does not keep rising, so the hull crosses it as before
  const trenchField = makeField((x, z) => (z < 20 ? 0 : 2.0));
  const crosser = makeEntity(trenchField, 0, 18.8, 0);
  crosser.state.speed = 6;
  assert(cliffAhead(trenchField, crosser.state, 3.5, 0, 1) === false, 'cliffAhead: a single 2 m step (trench wall) is crossed');
  const terraceField = makeField((x, z) => (z < 20 ? 0 : Math.min(2.6, (z - 20) * 1.8)));
  const stepper = makeEntity(terraceField, 0, 18.8, 0);
  stepper.state.speed = 6;
  assert(cliffAhead(terraceField, stepper.state, 3.5, 0, 1) === false, 'cliffAhead: a 2.6 m terrace lip is crossed');
}

// ------------------- 9e. fixed-mount hull traverse and yaw pin (round 32) --
// owner 2026-09-21: "playing turretless tanks is so janky and glitchy". One
// gun-origin request drives the hull traverse AND the gun lay; an engaged
// traverse parks the sight inside the arc (hysteresis) so the fine-lay joint
// lands the gun; the yaw pin is a limit the hull cannot fix — never the lag of
// a hull that is already closing.
{
  const DEG = Math.PI / 180;
  const wrapDeg = (a) => ((a + 540) % 360) - 180;
  const field = makeField(() => 0);
  const arcDeg = 10;
  const casemateSpec = { ...SPEC, gunArcDeg: arcDeg, armor: { ...SPEC.armor, turretless: true } };
  const aimAt = (ent, yawDeg, range = 150) => {
    const a = yawDeg * DEG;
    if (!ent.input.aimPoint) ent.input.aimPoint = new Vector3();
    ent.input.aimPoint.set(Math.sin(a) * range, 1.8, Math.cos(a) * range);
  };
  const requestDeg = (ent) => wrapDeg(Math.atan2(
    ent.input.aimPoint.x - ent.state.pos.x,
    ent.input.aimPoint.z - ent.state.pos.z,
  ) / DEG - ent.state.yaw / DEG);
  const boreErrorDeg = (ent) => {
    const pose = gunPoseWorld(ent.state);
    return pose.direction.angleTo(ent.input.aimPoint.clone().sub(pose.origin).normalize()) / DEG;
  };
  // Step `ticks` times; `before(i)` may move the sight first. Reports pin
  // toggles/ticks, worst per-tick hull and gun yaw steps, yawRate sign flips
  // and the largest hull-relative request seen.
  const watch = (ent, ticks, before = null) => {
    const w = { toggles: 0, pinnedTicks: 0, maxHullStep: 0, maxTurretStep: 0, yawRateFlips: 0, maxRequest: 0, latchChanges: 0 };
    let prevPin = ent.state.atGunLimit, prevYaw = ent.state.yaw, prevTurret = ent.state.turretYaw;
    let prevRate = ent.state.yawRate, prevLatch = ent.state._autoTraverse;
    for (let i = 0; i < ticks; i++) {
      if (before) before(i);
      updateTank(ent, field, SIM_DT);
      const s = ent.state;
      if (s.atGunLimit !== prevPin) { w.toggles++; prevPin = s.atGunLimit; }
      if (s._autoTraverse !== prevLatch) { w.latchChanges++; prevLatch = s._autoTraverse; }
      if (s.atGunLimit) w.pinnedTicks++;
      w.maxHullStep = Math.max(w.maxHullStep, Math.abs(wrapDeg((s.yaw - prevYaw) / DEG)));
      w.maxTurretStep = Math.max(w.maxTurretStep, Math.abs((s.turretYaw - prevTurret) / DEG));
      if (Math.abs(s.yawRate) > 0.05 && Math.abs(prevRate) > 0.05 &&
          Math.sign(s.yawRate) !== Math.sign(prevRate)) w.yawRateFlips++;
      w.maxRequest = Math.max(w.maxRequest, Math.abs(requestDeg(ent)));
      prevYaw = s.yaw; prevTurret = s.turretYaw; prevRate = s.yawRate;
    }
    return w;
  };
  const hullStepCap = SPEC.hullTraverseDegS * SIM_DT + 1e-9;
  const turretStepCap = SPEC.turretTraverseDegS * SIM_DT + 1e-9;

  // (1) a sight inside the arc: the fine-lay joint alone lands it, the hull never moves, no pin
  const inside = makeEntity(field, 0, 0, 0, casemateSpec);
  aimAt(inside, 6);
  const insideWatch = watch(inside, 240);
  near(inside.state.yaw, 0, 1e-9, 'casemate: a sight inside the arc never turns the hull');
  assert(insideWatch.pinnedTicks === 0 && inside.state._autoTraverse === 0,
    'casemate: a sight inside the arc is neither pinned nor engaged');
  assert(boreErrorDeg(inside) < 0.01,
    `casemate: the fine-lay joint lands on an in-arc sight (${boreErrorDeg(inside).toFixed(4)} deg)`);

  // (2) a sight just past the arc: the hull carries it inside and lets go; a closing hull is never a limit
  const edge = makeEntity(field, 0, 0, 0, casemateSpec);
  aimAt(edge, arcDeg + 2);
  const edgeWatch = watch(edge, 600);
  assert(edgeWatch.pinnedTicks === 0,
    `casemate: the yaw pin never fires while the hull is closing on the sight (${edgeWatch.pinnedTicks} pinned ticks)`);
  assert(edgeWatch.latchChanges === 2,
    `casemate: the traverse engages once and releases once (${edgeWatch.latchChanges} latch changes)`);
  assert(edge.state._autoTraverse === 0, 'casemate: the settled traverse is released');
  const parked = requestDeg(edge);
  assert(parked > 0.5 && parked < arcDeg - 2,
    `casemate: the traverse parks the sight inside the arc (${parked.toFixed(2)} deg of ${arcDeg})`);
  assert(boreErrorDeg(edge) < 0.05,
    `casemate: the gun lands on the sight after the traverse (${boreErrorDeg(edge).toFixed(4)} deg)`);
  assert(edgeWatch.maxHullStep <= hullStepCap,
    `casemate: the hull never yaws faster than its traverse rate (${edgeWatch.maxHullStep.toFixed(3)} deg/tick)`);
  assert(edgeWatch.maxTurretStep <= turretStepCap,
    `casemate: the gun never yaws faster than its traverse rate (${edgeWatch.maxTurretStep.toFixed(3)} deg/tick)`);

  // (2b) the player steers AGAINST an off-arc sight: that is a limit — pinned every tick; releasing the steer
  // lets the hull close and the pin clears exactly once
  const fought = makeEntity(field, 0, 0, 0, casemateSpec);
  aimAt(fought, arcDeg + 2);
  fought.input.steer = -1;
  const foughtWatch = watch(fought, 120);
  assert(foughtWatch.pinnedTicks === 120,
    `casemate: steering against an off-arc sight pins the gun (${foughtWatch.pinnedTicks}/120 ticks)`);
  fought.input.steer = 0;
  const releasedWatch = watch(fought, 900);
  assert(releasedWatch.toggles === 1 && !fought.state.atGunLimit,
    `casemate: releasing the steer clears the pin once and for all (${releasedWatch.toggles} toggles, pinned=${fought.state.atGunLimit})`);
  assert(boreErrorDeg(fought) < 0.05, 'casemate: the gun lands on the sight once the hull may close');

  // (2c) immobilised tracks: the hull cannot help, so the off-arc sight stays pinned and the hull stays put
  const immobile = makeEntity(field, 0, 0, 0, casemateSpec);
  immobile.combat = { modules: { trackL: { state: 'red' } } };
  aimAt(immobile, arcDeg + 2);
  const immobileWatch = watch(immobile, 120);
  assert(immobileWatch.pinnedTicks === 120, 'casemate: an immobile hull pins an off-arc sight');
  near(immobile.state.yaw, 0, 1e-9, 'casemate: an immobile hull does not auto-traverse');

  // (3) a slow pan out across the arc edge (6 deg/s): the hull nudges along, no pin, the sight never runs away
  const pan = makeEntity(field, 0, 0, 0, casemateSpec);
  aimAt(pan, 4);
  const panWatch = watch(pan, 180, (i) => aimAt(pan, 4 + i * 0.1));
  assert(panWatch.pinnedTicks === 0, `casemate: a slow pan across the arc edge never pins (${panWatch.pinnedTicks} ticks)`);
  assert(pan.state.yaw > 5 * DEG, 'casemate: the hull followed the pan');
  assert(panWatch.maxRequest < arcDeg + 1,
    `casemate: the hull keeps the panned sight within reach (${panWatch.maxRequest.toFixed(2)} deg max request)`);
  assert(Math.abs(pan.state.turretYaw) <= arcDeg * DEG + 1e-9, 'casemate: the gun never exceeds its arc');

  // (4) a sight dead astern that wobbles across 180 deg: the hull keeps the way it started (no dithering)
  const astern = makeEntity(field, 0, 0, 0, casemateSpec);
  aimAt(astern, 179);
  const asternWatch = watch(astern, 160, (i) => (i < 40 ? aimAt(astern, 180 + (i % 2 ? 1.5 : -1.5)) : aimAt(astern, 179)));
  assert(asternWatch.yawRateFlips === 0, `casemate: a wobbling stern sight never dithers the hull (${asternWatch.yawRateFlips} flips)`);
  assert(Math.abs(astern.state.yaw) > 30 * DEG, 'casemate: the hull makes progress toward the stern sight');
  watch(astern, 900);
  assert(!astern.state.atGunLimit && boreErrorDeg(astern) < 0.05,
    `casemate: the stern sight is reached and unpinned (${boreErrorDeg(astern).toFixed(4)} deg)`);

  // (5) origin parity: a gun mounted 3 m ahead of the hull centre aimed 9 m away — the traverse and the gun lay
  // read the same gun-origin request, so the hull parks where the gun can actually land (the old hull-centre
  // traverse parked the target 4.9 deg outside the bore's reach and left the reticle red for good)
  const longNoseSpec = { ...casemateSpec, armor: { ...casemateSpec.armor, gunPivot: [0, 0.25, 3.0] } };
  const longNose = makeEntity(field, 0, 0, 0, longNoseSpec);
  aimAt(longNose, 30, 9);
  const longNoseWatch = watch(longNose, 600);
  const longNosePose = (() => {
    const hull = new Quaternion().setFromEuler(new Euler(-longNose.state.visualPitch, longNose.state.yaw, longNose.state.visualRoll, 'YXZ'));
    const origin = new Vector3(...longNoseSpec.armor.gunPivot).applyAxisAngle(new Vector3(0, 1, 0), longNose.state.turretYaw)
      .add(new Vector3(...SPEC.armor.turretPivot)).applyQuaternion(hull).add(longNose.state.pos);
    const direction = new Vector3(Math.sin(longNose.state.turretYaw) * Math.cos(longNose.state.gunPitch), Math.sin(longNose.state.gunPitch),
      Math.cos(longNose.state.turretYaw) * Math.cos(longNose.state.gunPitch)).applyQuaternion(hull).normalize();
    return direction.angleTo(longNose.input.aimPoint.clone().sub(origin).normalize()) / DEG;
  })();
  assert(longNoseWatch.pinnedTicks === 0 && longNose.state._autoTraverse === 0,
    'casemate: a close sight seen from a forward gun origin settles unpinned and released');
  assert(longNosePose < 0.1,
    `casemate: the forward-mounted gun lands on the close sight (${longNosePose.toFixed(3)} deg bore error)`);

  // (6) hydraulic fixed gun: the hull IS the traverse — closing is never a limit; steering against it is
  const hydraulicSpec = {
    ...SPEC, gunArcDeg: 4,
    hydropneumaticAim: { noseDownDeg: 6, noseUpDeg: 8, rateDegS: 5 },
    armor: { ...SPEC.armor, turretless: true },
  };
  const swede = makeEntity(field, 0, 0, 0, hydraulicSpec);
  swede.state.suspensionAim = true;
  aimAt(swede, 30);
  const swedeWatch = watch(swede, 600);
  assert(swedeWatch.pinnedTicks === 0,
    `hydraulic: a hull closing on the sight is never pinned (${swedeWatch.pinnedTicks} ticks)`);
  assert(swedeWatch.latchChanges === 2 && swede.state._autoTraverse === 0,
    `hydraulic: the traverse engages past the reach window and releases once inside (${swedeWatch.latchChanges} changes)`);
  // (the pivot-style turn walks the hull ~0.6 m sideways, so judge the bore against the sight, not a fixed yaw)
  assert(boreErrorDeg(swede) < 0.15,
    `hydraulic: the hull lands on the sight line (${boreErrorDeg(swede).toFixed(3)} deg bore error)`);
  assert(swedeWatch.maxHullStep <= hullStepCap, 'hydraulic: the hull never exceeds its traverse rate');
  const swedeTrack = makeEntity(field, 0, 0, 0, hydraulicSpec);
  swedeTrack.state.suspensionAim = true;
  aimAt(swedeTrack, 0);
  const trackWatch = watch(swedeTrack, 180, (i) => aimAt(swedeTrack, i * (2 / 60)));
  assert(trackWatch.pinnedTicks === 0 && trackWatch.latchChanges === 0,
    `hydraulic: tracking a 2 deg/s sight stays inside the reach window (${trackWatch.latchChanges} latch changes)`);
  const swedeFought = makeEntity(field, 0, 0, 0, hydraulicSpec);
  swedeFought.state.suspensionAim = true;
  aimAt(swedeFought, 30);
  swedeFought.input.steer = -1;
  assert(watch(swedeFought, 60).pinnedTicks === 60, 'hydraulic: steering against the sight pins the fixed gun');
  swedeFought.input.steer = 0;
  const swedeReleased = watch(swedeFought, 900);
  assert(swedeReleased.toggles === 1 && !swedeFought.state.atGunLimit,
    `hydraulic: releasing the steer clears the pin once (${swedeReleased.toggles} toggles)`);

  // (6b) a level sight dead astern: the suspension pitch must NOT run away while the hull turns around (the old
  // hull-space elevation flipped sign behind the hull and drove the nose to its +stop, pinning the reticle)
  const aboutFace = makeEntity(field, 0, 0, 0, hydraulicSpec);
  aboutFace.state.suspensionAim = true;
  // first lay on a raised sight ahead so the hull sits nose-up (the pose that exposed the bug)
  aboutFace.input.aimPoint = new Vector3(0, 1.8 + 150 * Math.tan(5 * DEG), 150);
  watch(aboutFace, 300);
  near(aboutFace.state.suspensionAimPitch / DEG, 5, 0.3, 'hydraulic: the suspension lays the fixed gun on a raised sight');
  aimAt(aboutFace, 179);
  let worstSuspDeg = 0;
  const aboutFaceWatch = watch(aboutFace, 900, () => {
    worstSuspDeg = Math.max(worstSuspDeg, Math.abs(aboutFace.state.suspensionAimPitch) / DEG);
  });
  assert(worstSuspDeg < 5.5,
    `hydraulic: a level stern sight never drives the suspension pitch away (${worstSuspDeg.toFixed(2)} deg worst)`);
  assert(Math.abs(aboutFace.state.suspensionAimPitch) / DEG < 0.5,
    `hydraulic: the suspension settles level on the level stern sight (${(aboutFace.state.suspensionAimPitch / DEG).toFixed(2)} deg)`);
  assert(aboutFaceWatch.pinnedTicks === 0,
    `hydraulic: turning around onto a level sight never pins (${aboutFaceWatch.pinnedTicks} ticks)`);
  assert(boreErrorDeg(aboutFace) < 0.15, 'hydraulic: the about-face lands the bore on the sight');

  // (7) a turret is untouched by any of this
  const turreted = makeEntity(field, 0, 0, 0);
  aimAt(turreted, 90);
  watch(turreted, 300);
  assert(turreted.state._autoTraverse === 0 && turreted.state.yaw === 0,
    'turreted: no hull traverse latch, the hull never auto-turns');
}

console.log(`movement.selftest: all ${checks} checks passed`);
