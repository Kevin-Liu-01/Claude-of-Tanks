/**
 * movement.selftest.mjs — standalone verification of tank movement, hull
 * attitude, sprung-mass heave, and TERRAIN CONTACT. The chassis may now move
 * inside the visible suspension envelope; the wheels and deforming belt own
 * final contact instead of a rigid root plane tracing the heightfield.
 * Run with: node src/sim/movement.selftest.mjs
 * Exits 0 quietly on pass, non-zero with messages on failure.
 * Uses inline fixtures only — no dependency on vehicles/specs.js.
 */

import { Euler, Quaternion, Vector3 } from 'three';
import {
  createTankState, fireRecoil, shotRecoilScale,
  IFV_AUTOCANNON_AFTER_SHOT_BLOOM, IFV_AUTOCANNON_RECOIL_SCALE,
  updateTank, SIM_DT,
} from './movement.ts';

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
  ent.state._body.autoRighting = true;
  run(ent, field, 300);
  const upY = Math.cos(ent.state.visualPitch) * Math.cos(ent.state.visualRoll);
  assert(upY > 0.9, `auto-right actuator rolls through the contact edge (${upY.toFixed(3)} up)`);
  assert(ent.state._body.autoRighting === false && ent.state._body.tumbling === false,
    'auto-right actuator releases back to ordinary terrain support');
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

// ---------------------------------------------------------------- summary --
if (failures > 0) {
  console.error(`movement.selftest: ${failures}/${checks} checks FAILED`);
  process.exit(1);
}
console.log(`movement.selftest: all ${checks} checks passed`);
