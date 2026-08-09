/**
 * movement.selftest.mjs — standalone verification of tank movement, hull
 * attitude and TERRAIN CONTACT (the r5 hard gate: no track/wheel geometry may
 * render below the heightfield or fully levitate above it).
 * Run with: node src/sim/movement.selftest.mjs
 * Exits 0 quietly on pass, non-zero with messages on failure.
 * Uses inline fixtures only — no dependency on vehicles/specs.js.
 */

import { Vector3 } from 'three';
import { createTankState, updateTank, SIM_DT } from './movement.js';

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
  },
};

function makeField(fn) {
  return {
    getHeightAt: fn,
    getNormalAt: () => null,
    getGroundType: () => 'medium',
  };
}

function makeEntity(field, x = 0, z = 0, yaw = 0) {
  const pos = new Vector3(x, field.getHeightAt(x, z), z);
  return {
    spec: SPEC,
    state: createTankState(SPEC, pos, yaw),
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
// report the worst penetration (< 0 gap) and the smallest gap (contact proof).
const SUSP_VIS_P = 2.6;
const SUSP_VIS_R = 2.1;
// MOVEMENT r1: 2.3 was a stale mirror — movement.js/tankFactory lock SWAY_VIS
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
// roll action. HARD GATE per frame after spring settle: contact-line
// penetration < 0.05 m and no full-patch levitation (some point within 5 cm).
// (8, 0.55) is fully climbable (~23° faces) and proves sustained cross-country
// driving; the steeper pairs stress the contact solve while the tank wallows
// in troughs walled by >MAX_CLIMB faces (stalling there is correct physics).
for (const [wl, amp] of [[8, 1.5], [8, 0.55], [4, 0.5], [2, 0.12]]) {
  const k = (2 * Math.PI) / wl;
  const kx = (2 * Math.PI) / (wl * 1.3);
  // Spawn just past a crest (downhill start): faces steeper than MAX_CLIMB
  // stall the drive correctly, so an uphill spawn would park the tank.
  const field = makeField((x, z) => amp * Math.sin(k * z) + 0.3 * amp * Math.sin(kx * x));
  const ent = makeEntity(field, 0, 0.55 * wl, 0);
  ent.input.throttle = 1;
  let worstPen = 0;
  let worstFloat = 0;
  let path = 0; // integrated |v| — steep faces (>MAX_CLIMB) stall correctly,
  //              so wallowing/sliding counts as motion, displacement does not
  run(ent, field, 900, (i) => {
    path += Math.abs(ent.state.speed) * SIM_DT;
    if (i < 60) return; // spring settle from spawn
    const { penetration, minGap } = contactStats(ent.state, field);
    if (penetration > worstPen) worstPen = penetration;
    if (minGap > worstFloat) worstFloat = minGap;
  });
  assert(worstPen < 0.05,
    `sine drive λ=${wl} A=${amp}: track penetration ${worstPen.toFixed(3)} m ≥ 0.05`);
  assert(worstFloat < 0.07,
    `sine drive λ=${wl} A=${amp}: full contact patch airborne (min gap up to ${worstFloat.toFixed(3)} m)`);
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
  run(ent, field, 900, (i) => {
    if (i < 60) return;
    const { penetration, minGap } = contactStats(ent.state, field);
    if (penetration > worstPen) worstPen = penetration;
    if (minGap > worstFloat) worstFloat = minGap;
  });
  assert(worstPen < 0.05, `egg-crate drive: penetration ${worstPen.toFixed(3)} m ≥ 0.05`);
  assert(worstFloat < 0.07, `egg-crate drive: levitation (min gap up to ${worstFloat.toFixed(3)} m)`);
}

// -------------------------------------------- 6. measured contact geometry --
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
  const gph = SPEC.armor.turretPivot[1] + SPEC.armor.gunPivot[1];
  const worldPitch = st.gunPitch + st.visualPitch * Math.cos(st.turretYaw)
    + st.visualRoll * Math.sin(st.turretYaw);
  const barrel = SPEC.armor.gunBarrel.lengthM;
  const reach = SPEC.armor.gunPivot[2] + barrel * Math.cos(worldPitch);
  const gunYawW = st.yaw + st.turretYaw;
  const mx = st.pos.x + Math.sin(gunYawW) * reach;
  const mz = st.pos.z + Math.cos(gunYawW) * reach;
  const muzzleY = st.pos.y + gph + barrel * Math.sin(worldPitch);
  const ground = field.getHeightAt(mx, mz);
  assert(muzzleY > ground + 0.1,
    `muzzle clamp: muzzle ${muzzleY.toFixed(2)} m vs ground ${ground.toFixed(2)} m (+0.1 min)`);
  assert(st.atGunLimit === true, 'muzzle clamp: atGunLimit flags the pinned gun');
}

// ---------------------------------------------------------------- summary --
if (failures > 0) {
  console.error(`movement.selftest: ${failures}/${checks} checks FAILED`);
  process.exit(1);
}
console.log(`movement.selftest: all ${checks} checks passed`);
